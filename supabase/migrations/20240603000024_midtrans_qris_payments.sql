-- Pembayaran Midtrans QRIS: top-up, NGOJEK, kuliner

ALTER TYPE public.wallet_tx_type ADD VALUE IF NOT EXISTS 'topup_qris';

CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  midtrans_order_id TEXT NOT NULL UNIQUE,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('topup', 'ngojek', 'food')),
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  gross_amount NUMERIC(14, 2) NOT NULL CHECK (gross_amount > 0),
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'settlement', 'expire', 'cancel', 'deny')),
  qris_acquirer TEXT,
  qris_url TEXT,
  qris_string TEXT,
  platform_fee NUMERIC(14, 2) NOT NULL DEFAULT 0,
  merchant_share NUMERIC(14, 2) NOT NULL DEFAULT 0,
  driver_share NUMERIC(14, 2) NOT NULL DEFAULT 0,
  merchant_share_paid BOOLEAN NOT NULL DEFAULT FALSE,
  driver_share_paid BOOLEAN NOT NULL DEFAULT FALSE,
  midtrans_transaction_id TEXT,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_transactions_customer_idx
  ON public.payment_transactions (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS payment_transactions_order_idx
  ON public.payment_transactions (order_id);

COMMENT ON TABLE public.payment_transactions IS 'Transaksi Midtrans QRIS — topup / ngojek / food';

-- Settlement atomik dari webhook Midtrans
CREATE OR REPLACE FUNCTION public.process_midtrans_settlement(
  p_midtrans_order_id TEXT,
  p_gross_amount NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pt public.payment_transactions%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_commission_rate NUMERIC(5, 4) := 0.10;
  v_driver_net NUMERIC(14, 2);
BEGIN
  SELECT * INTO v_pt
  FROM public.payment_transactions
  WHERE midtrans_order_id = p_midtrans_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payment_not_found');
  END IF;

  IF v_pt.status = 'settlement' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_settled', true,
      'payment_type', v_pt.payment_type,
      'order_id', v_pt.order_id
    );
  END IF;

  IF ABS(v_pt.gross_amount - p_gross_amount) > 0.01 THEN
    RAISE EXCEPTION 'Nominal pembayaran tidak sesuai';
  END IF;

  -- === TOPUP: kredit saldo customer ===
  IF v_pt.payment_type = 'topup' THEN
    PERFORM public.wallet_apply_tx(
      'customer',
      v_pt.customer_id,
      p_gross_amount,
      'topup_qris',
      NULL,
      p_midtrans_order_id,
      'Top up QRIS Midtrans'
    );

    UPDATE public.payment_transactions
    SET status = 'settlement', settled_at = NOW()
    WHERE id = v_pt.id;

    RETURN jsonb_build_object(
      'ok', true,
      'payment_type', 'topup',
      'customer_id', v_pt.customer_id
    );
  END IF;

  -- === ORDER: ngojek / food ===
  IF v_pt.order_id IS NULL THEN
    RAISE EXCEPTION 'Order tidak terhubung';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = v_pt.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order tidak ditemukan';
  END IF;

  IF v_order.order_status <> 'paid' THEN
    UPDATE public.orders
    SET
      order_status = 'paid',
      payment_method = 'gateway',
      payment_gateway = 'midtrans_qris',
      snap_token = p_midtrans_order_id
    WHERE id = v_order.id;
  END IF;

  IF v_pt.payment_type = 'ngojek' THEN
    v_pt.platform_fee := ROUND(v_order.delivery_fee * v_commission_rate, 2);
    v_driver_net := GREATEST(v_order.delivery_fee - v_pt.platform_fee, 0);
    v_pt.driver_share := v_driver_net;
    v_pt.merchant_share := 0;

    -- NGOJEK: 90% ke driver (dicatat; dikredit saat order selesai)
    UPDATE public.payment_transactions
    SET
      status = 'settlement',
      settled_at = NOW(),
      platform_fee = v_pt.platform_fee,
      driver_share = v_pt.driver_share,
      merchant_share = 0
    WHERE id = v_pt.id;

    RETURN jsonb_build_object(
      'ok', true,
      'payment_type', 'ngojek',
      'order_id', v_order.id,
      'driver_share', v_pt.driver_share,
      'platform_fee', v_pt.platform_fee,
      'notify_drivers', true
    );
  END IF;

  -- FOOD: merchant langsung, ongkir driver saat selesai
  v_pt.merchant_share := v_order.total_product_amount;
  v_pt.driver_share := v_order.delivery_fee;
  v_pt.platform_fee := 0;

  IF v_pt.merchant_share > 0 AND NOT v_pt.merchant_share_paid THEN
    PERFORM public.wallet_apply_tx(
      'merchant',
      v_order.merchant_id,
      v_pt.merchant_share,
      'order_earning',
      v_order.id,
      NULL,
      'Pembayaran kuliner QRIS'
    );
    v_pt.merchant_share_paid := TRUE;
  END IF;

  UPDATE public.payment_transactions
  SET
    status = 'settlement',
    settled_at = NOW(),
    platform_fee = 0,
    merchant_share = v_pt.merchant_share,
    driver_share = v_pt.driver_share,
    merchant_share_paid = v_pt.merchant_share_paid
  WHERE id = v_pt.id;

  RETURN jsonb_build_object(
    'ok', true,
    'payment_type', 'food',
    'order_id', v_order.id,
    'merchant_share', v_pt.merchant_share,
    'driver_share', v_pt.driver_share,
    'notify_drivers', true
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_midtrans_settlement TO service_role;
