-- Defensive security: withdraw RPC, RLS withdrawals, GPS trust, promo codes

-- ---------------------------------------------------------------------------
-- 1. ALUR KEUANGAN — handle_withdraw dengan Row-Level Locking
-- Catatan WIRA: saldo disimpan di tabel `wallets`, bukan kolom drivers.balance.
-- Fungsi ini mengunci baris driver DAN baris wallet agar withdraw simultan aman.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_withdraw(
  driver_id_param UUID,
  amount_param NUMERIC,
  method_param TEXT DEFAULT 'ewallet',
  destination_param TEXT DEFAULT '',
  destination_name_param TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver public.drivers%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
  v_new_balance NUMERIC(14, 2);
  v_tx_id UUID;
  v_withdrawal_id UUID;
  v_tx_type public.wallet_tx_type;
BEGIN
  IF amount_param IS NULL OR amount_param <= 0 THEN
    RAISE EXCEPTION 'Nominal penarikan tidak valid';
  END IF;

  IF method_param NOT IN ('ewallet', 'va_bank') THEN
    RAISE EXCEPTION 'Metode penarikan tidak valid';
  END IF;

  IF destination_param IS NULL OR length(trim(destination_param)) < 5 THEN
    RAISE EXCEPTION 'Tujuan penarikan wajib diisi';
  END IF;

  -- Kunci baris driver agar dua request paralel tidak bisa lewat validasi bersamaan
  SELECT * INTO v_driver
  FROM public.drivers
  WHERE id = driver_id_param
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Driver tidak ditemukan';
  END IF;

  -- Saldo aktual ada di wallets — kunci baris wallet (inti anti race condition)
  INSERT INTO public.wallets (owner_type, owner_id, balance)
  VALUES ('driver'::public.wallet_owner_type, driver_id_param, 0)
  ON CONFLICT (owner_type, owner_id) DO NOTHING;

  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE owner_type = 'driver'::public.wallet_owner_type
    AND owner_id = driver_id_param
  FOR UPDATE;

  v_new_balance := v_wallet.balance - amount_param;
  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'Saldo tidak mencukupi';
  END IF;

  v_tx_type := CASE
    WHEN method_param = 'va_bank' THEN 'withdraw_va'::public.wallet_tx_type
    ELSE 'withdraw_ewallet'::public.wallet_tx_type
  END;

  UPDATE public.wallets
  SET balance = v_new_balance, updated_at = NOW()
  WHERE id = v_wallet.id;

  INSERT INTO public.wallet_transactions (
    wallet_id, tx_type, amount, balance_after, topup_ref, note
  )
  VALUES (
    v_wallet.id,
    v_tx_type,
    -amount_param,
    v_new_balance,
    'WD_' || upper(method_param) || '_' || extract(epoch FROM now())::bigint,
    'Tarik saldo driver (handle_withdraw RPC)'
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.wallet_withdrawals (
    owner_type, owner_id, wallet_tx_id, amount, method,
    destination, destination_name, status, processed_at
  )
  VALUES (
    'driver', driver_id_param, v_tx_id, amount_param, method_param,
    trim(destination_param), nullif(trim(destination_name_param), ''),
    'completed', NOW()
  )
  RETURNING id INTO v_withdrawal_id;

  RETURN jsonb_build_object(
    'ok', true,
    'withdrawal_id', v_withdrawal_id,
    'wallet_tx_id', v_tx_id,
    'balance', v_new_balance
  );
END;
$$;

COMMENT ON FUNCTION public.handle_withdraw IS
  'Penarikan saldo driver atomik: FOR UPDATE pada drivers + wallets. Request simultan kedua menunggu lock lalu gagal jika saldo kurang.';

GRANT EXECUTE ON FUNCTION public.handle_withdraw TO service_role;

-- ---------------------------------------------------------------------------
-- 2. ALUR AKSES DATA — RLS wallet_withdrawals (tabel withdrawals di WIRA)
-- ---------------------------------------------------------------------------

ALTER TABLE public.wallet_withdrawals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wallet_withdrawals_select_own" ON public.wallet_withdrawals;
CREATE POLICY "wallet_withdrawals_select_own"
  ON public.wallet_withdrawals FOR SELECT
  TO authenticated
  USING (
    (owner_type = 'customer' AND owner_id = auth.uid())
    OR (
      owner_type = 'driver'
      AND owner_id IN (
        SELECT d.id FROM public.drivers d WHERE d.profile_id = auth.uid()
      )
    )
    OR (
      owner_type = 'merchant'
      AND owner_id IN (
        SELECT m.id FROM public.merchants m WHERE m.owner_id = auth.uid()
      )
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "wallet_withdrawals_insert_service_only" ON public.wallet_withdrawals;
CREATE POLICY "wallet_withdrawals_insert_service_only"
  ON public.wallet_withdrawals FOR INSERT
  TO authenticated
  WITH CHECK (false);

COMMENT ON POLICY "wallet_withdrawals_select_own" ON public.wallet_withdrawals IS
  'Anti IDOR: user hanya bisa SELECT penarikan miliknya (customer=auth.uid, driver/merchant via relasi). Insert hanya via RPC/service_role.';

-- ---------------------------------------------------------------------------
-- 4. ALUR GPS — status kepercayaan lokasi driver
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.gps_trust_status AS ENUM ('OK', 'SUSPICIOUS');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS gps_trust public.gps_trust_status NOT NULL DEFAULT 'OK',
  ADD COLUMN IF NOT EXISTS last_gps_ping_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_gps_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS last_gps_lng DOUBLE PRECISION;

COMMENT ON COLUMN public.drivers.gps_trust IS
  'SUSPICIOUS = velocity check mendeteksi loncat GPS tidak wajar (fake GPS)';

-- ---------------------------------------------------------------------------
-- 3. ALUR HARGA & PROMO — kode promo (harga validasi di server action)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.promo_codes (
  code TEXT PRIMARY KEY,
  discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 0
    CHECK (discount_percent >= 0 AND discount_percent <= 100),
  max_discount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  min_order_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "promo_codes_select_active"
  ON public.promo_codes FOR SELECT
  TO authenticated
  USING (is_active = TRUE AND (valid_until IS NULL OR valid_until > NOW()));

COMMENT ON TABLE public.promo_codes IS
  'Diskon hanya dibaca server — frontend tidak boleh mengirim nominal diskon.';
