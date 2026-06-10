-- =============================================================================
-- AKUNTANSI DIGITAL WIRA — Buku besar aplikasi, bagi hasil atomik, audit trail
-- =============================================================================

CREATE TYPE public.app_revenue_source_type AS ENUM (
  'TRANSPORT_COMMISSION',
  'MERCHANT_MARKUP'
);

CREATE TYPE public.financial_log_type AS ENUM ('IN', 'OUT');

-- Pendapatan hak milik aplikasi (10% transport / markup Rp1.000 produk)
CREATE TABLE IF NOT EXISTS public.app_revenues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  source_type public.app_revenue_source_type NOT NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS app_revenues_order_idx ON public.app_revenues (order_id);
CREATE INDEX IF NOT EXISTS app_revenues_source_created_idx
  ON public.app_revenues (source_type, created_at DESC);

-- Buku besar mutasi kas internal aplikasi (audit trail)
CREATE TABLE IF NOT EXISTS public.financial_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.financial_log_type NOT NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  balance_after NUMERIC(14, 2) NOT NULL CHECK (balance_after >= 0),
  description TEXT NOT NULL,
  reference_table TEXT,
  reference_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS financial_logs_created_idx
  ON public.financial_logs (created_at DESC);

-- Saldo internal aplikasi (representasi akumulasi pendapatan − penarikan)
CREATE TABLE IF NOT EXISTS public.app_finance_ledger (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  balance NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.app_finance_ledger (id, balance) VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

-- Riwayat penarikan dana aplikasi ke rekening bank
CREATE TABLE IF NOT EXISTS public.app_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_holder TEXT NOT NULL,
  note TEXT,
  recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS app_withdrawals_created_idx
  ON public.app_withdrawals (created_at DESC);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS settlement_processed BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON TABLE public.app_revenues IS 'Porsi pendapatan milik platform per order';
COMMENT ON TABLE public.financial_logs IS 'Audit trail IN/OUT saldo internal aplikasi';
COMMENT ON TABLE public.app_withdrawals IS 'Catatan penarikan dana aplikasi ke bank';

-- Hanya service role (API admin / RPC) — tidak diekspos ke client
ALTER TABLE public.app_revenues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_finance_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_withdrawals ENABLE ROW LEVEL SECURITY;

-- Helper: kredit/debit saldo internal aplikasi + catat financial_logs
CREATE OR REPLACE FUNCTION public.app_ledger_apply(
  p_direction public.financial_log_type,
  p_amount NUMERIC,
  p_description TEXT,
  p_reference_table TEXT DEFAULT NULL,
  p_reference_id UUID DEFAULT NULL
) RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ledger public.app_finance_ledger%ROWTYPE;
  v_new_balance NUMERIC(14, 2);
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount harus positif';
  END IF;

  SELECT * INTO v_ledger FROM public.app_finance_ledger WHERE id = 1 FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.app_finance_ledger (id, balance) VALUES (1, 0);
    SELECT * INTO v_ledger FROM public.app_finance_ledger WHERE id = 1 FOR UPDATE;
  END IF;

  IF p_direction = 'IN' THEN
    v_new_balance := v_ledger.balance + p_amount;
  ELSE
    v_new_balance := v_ledger.balance - p_amount;
    IF v_new_balance < 0 THEN
      RAISE EXCEPTION 'Saldo internal aplikasi tidak mencukupi';
    END IF;
  END IF;

  UPDATE public.app_finance_ledger
  SET balance = v_new_balance, updated_at = NOW()
  WHERE id = 1;

  INSERT INTO public.financial_logs (
    type, amount, balance_after, description, reference_table, reference_id
  )
  VALUES (
    p_direction, p_amount, v_new_balance, p_description, p_reference_table, p_reference_id
  );

  RETURN v_new_balance;
END;
$$;

-- Settlement atomik saat order delivered
CREATE OR REPLACE FUNCTION public.process_order_settlement(
  order_id_param UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_is_transport BOOLEAN;
  v_platform_transport NUMERIC(14, 2);
  v_driver_net NUMERIC(14, 2);
  v_markup NUMERIC(14, 2);
  v_merchant_amt NUMERIC(14, 2);
  v_item_qty INTEGER;
  v_pt public.payment_transactions%ROWTYPE;
  v_has_pt BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = order_id_param
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order tidak ditemukan';
  END IF;

  IF v_order.settlement_processed THEN
    RETURN jsonb_build_object('ok', true, 'already_settled', true, 'order_id', order_id_param);
  END IF;

  IF v_order.order_status IS DISTINCT FROM 'delivered' THEN
    RAISE EXCEPTION 'Settlement hanya untuk order berstatus delivered';
  END IF;

  v_is_transport := v_order.delivery_address LIKE '[NGOJEK]%';

  SELECT * INTO v_pt
  FROM public.payment_transactions
  WHERE order_id = order_id_param AND status = 'settlement'
  LIMIT 1
  FOR UPDATE;

  v_has_pt := FOUND;

  -- === TRANSPORT (NGOJEK / ojek): 10% aplikasi, 90% driver ===
  IF v_is_transport THEN
    v_platform_transport := ROUND(COALESCE(v_order.delivery_fee, 0) * 0.10, 2);
    v_driver_net := GREATEST(COALESCE(v_order.delivery_fee, 0) - v_platform_transport, 0);

    IF v_platform_transport > 0 THEN
      INSERT INTO public.app_revenues (order_id, source_type, amount, description)
      VALUES (
        order_id_param,
        'TRANSPORT_COMMISSION',
        v_platform_transport,
        'Komisi 10% tarif transport order ' || order_id_param::TEXT
      );
      PERFORM public.app_ledger_apply(
        'IN',
        v_platform_transport,
        'Komisi transport 10%',
        'app_revenues',
        order_id_param
      );
    END IF;

    IF v_order.driver_id IS NOT NULL AND v_driver_net > 0 THEN
      IF NOT v_has_pt OR NOT v_pt.driver_share_paid THEN
        PERFORM public.wallet_apply_tx(
          'driver',
          v_order.driver_id,
          v_driver_net,
          'order_earning',
          order_id_param,
          NULL,
          'Pendapatan transport 90% (settlement RPC)'
        );
        IF v_has_pt THEN
          UPDATE public.payment_transactions
          SET driver_share_paid = TRUE, driver_share = v_driver_net
          WHERE id = v_pt.id;
        END IF;
      END IF;
    END IF;

    UPDATE public.orders SET settlement_processed = TRUE WHERE id = order_id_param;

    RETURN jsonb_build_object(
      'ok', true,
      'order_type', 'transport',
      'platform_fee', v_platform_transport,
      'driver_net', v_driver_net
    );
  END IF;

  -- === KULINER: markup Rp1.000 × qty → aplikasi; merchant harga dasar; ongkir 90/10 ===
  SELECT COALESCE(SUM(oi.quantity), 0)::INTEGER INTO v_item_qty
  FROM public.order_items oi
  WHERE oi.order_id = order_id_param AND oi.product_id IS NOT NULL;

  v_markup := COALESCE(
    NULLIF(v_order.platform_markup_amount, 0),
    v_item_qty * 1000
  );

  IF v_markup > 0 THEN
    INSERT INTO public.app_revenues (order_id, source_type, amount, description)
    VALUES (
      order_id_param,
      'MERCHANT_MARKUP',
      v_markup,
      'Markup Rp1.000 × ' || v_item_qty::TEXT || ' item order ' || order_id_param::TEXT
    );
    PERFORM public.app_ledger_apply(
      'IN',
      v_markup,
      'Markup merchant Rp1.000/produk',
      'app_revenues',
      order_id_param
    );
  END IF;

  v_merchant_amt := COALESCE(
    NULLIF(v_order.merchant_product_amount, 0),
    v_order.total_product_amount
  );

  IF v_order.merchant_id IS NOT NULL AND v_merchant_amt > 0 THEN
    IF NOT v_has_pt OR NOT v_pt.merchant_share_paid THEN
      PERFORM public.wallet_apply_tx(
        'merchant',
        v_order.merchant_id,
        v_merchant_amt,
        'order_earning',
        order_id_param,
        NULL,
        'Pendapatan kuliner harga merchant (settlement RPC)'
      );
      IF v_has_pt THEN
        UPDATE public.payment_transactions
        SET merchant_share_paid = TRUE, merchant_share = v_merchant_amt
        WHERE id = v_pt.id;
      END IF;
    END IF;
  END IF;

  v_platform_transport := ROUND(COALESCE(v_order.delivery_fee, 0) * 0.10, 2);
  v_driver_net := GREATEST(COALESCE(v_order.delivery_fee, 0) - v_platform_transport, 0);

  IF v_platform_transport > 0 THEN
    INSERT INTO public.app_revenues (order_id, source_type, amount, description)
    VALUES (
      order_id_param,
      'TRANSPORT_COMMISSION',
      v_platform_transport,
      'Komisi 10% ongkir kuliner order ' || order_id_param::TEXT
    );
    PERFORM public.app_ledger_apply(
      'IN',
      v_platform_transport,
      'Komisi ongkir kuliner 10%',
      'app_revenues',
      order_id_param
    );
  END IF;

  IF v_order.driver_id IS NOT NULL AND v_driver_net > 0 THEN
    IF NOT v_has_pt OR NOT v_pt.driver_share_paid THEN
      PERFORM public.wallet_apply_tx(
        'driver',
        v_order.driver_id,
        v_driver_net,
        'order_earning',
        order_id_param,
        NULL,
        'Ongkir kuliner 90% (settlement RPC)'
      );
      IF v_has_pt THEN
        UPDATE public.payment_transactions
        SET driver_share_paid = TRUE, driver_share = v_driver_net
        WHERE id = v_pt.id;
      END IF;
    END IF;
  END IF;

  UPDATE public.orders SET settlement_processed = TRUE WHERE id = order_id_param;

  RETURN jsonb_build_object(
    'ok', true,
    'order_type', 'food',
    'markup', v_markup,
    'merchant_amount', v_merchant_amt,
    'platform_transport_fee', v_platform_transport,
    'driver_net', v_driver_net
  );
END;
$$;

-- Penarikan dana aplikasi ke bank (atomik)
CREATE OR REPLACE FUNCTION public.record_app_withdrawal(
  p_amount NUMERIC,
  p_bank_name TEXT,
  p_account_number TEXT,
  p_account_holder TEXT,
  p_note TEXT,
  p_admin_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_balance NUMERIC(14, 2);
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Nominal penarikan harus positif';
  END IF;

  v_balance := public.app_ledger_apply(
    'OUT',
    p_amount,
    'Penarikan dana aplikasi ke ' || p_bank_name || ' — ' || p_account_holder,
    NULL,
    NULL
  );

  INSERT INTO public.app_withdrawals (
    amount, bank_name, account_number, account_holder, note, recorded_by
  )
  VALUES (
    p_amount,
    p_bank_name,
    p_account_number,
    p_account_holder,
    NULLIF(TRIM(p_note), ''),
    p_admin_id
  )
  RETURNING id INTO v_id;

  UPDATE public.financial_logs
  SET reference_table = 'app_withdrawals', reference_id = v_id
  WHERE id = (
    SELECT id FROM public.financial_logs ORDER BY created_at DESC LIMIT 1
  );

  RETURN jsonb_build_object(
    'ok', true,
    'withdrawal_id', v_id,
    'balance_after', v_balance
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.app_ledger_apply TO service_role;
GRANT EXECUTE ON FUNCTION public.process_order_settlement TO service_role;
GRANT EXECUTE ON FUNCTION public.record_app_withdrawal TO service_role;
