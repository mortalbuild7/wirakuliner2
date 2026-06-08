-- Kota layanan driver + dompet saldo (customer, driver, merchant)

CREATE TABLE IF NOT EXISTS public.service_cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  center_lat NUMERIC(10, 7) NOT NULL,
  center_lng NUMERIC(10, 7) NOT NULL,
  radius_km NUMERIC(6, 2) NOT NULL DEFAULT 12 CHECK (radius_km > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS service_cities_name_lower_idx
  ON public.service_cities (LOWER(name));

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS service_city_id UUID REFERENCES public.service_cities(id) ON DELETE SET NULL;

ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS service_city_id UUID REFERENCES public.service_cities(id) ON DELETE SET NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS service_city_id UUID REFERENCES public.service_cities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'gateway'
    CHECK (payment_method IN ('gateway', 'wallet'));

CREATE TYPE public.wallet_owner_type AS ENUM ('customer', 'driver', 'merchant');

CREATE TABLE IF NOT EXISTS public.wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type public.wallet_owner_type NOT NULL,
  owner_id UUID NOT NULL,
  balance NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (owner_type, owner_id)
);

CREATE TYPE public.wallet_tx_type AS ENUM (
  'topup_ewallet',
  'topup_va',
  'order_payment',
  'order_earning',
  'adjustment'
);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  tx_type public.wallet_tx_type NOT NULL,
  amount NUMERIC(14, 2) NOT NULL,
  balance_after NUMERIC(14, 2) NOT NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  topup_ref TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wallet_transactions_wallet_idx
  ON public.wallet_transactions (wallet_id, created_at DESC);

-- Kota awal: Parung, Bogor (pusat Jalan Wira)
INSERT INTO public.service_cities (name, slug, center_lat, center_lng, radius_km, is_active)
VALUES (
  'Parung, Bogor',
  'parung-bogor',
  -6.42776,
  106.727392,
  12,
  TRUE
)
ON CONFLICT (slug) DO NOTHING;

-- Merchant existing → kota default
UPDATE public.merchants m
SET service_city_id = sc.id
FROM public.service_cities sc
WHERE sc.slug = 'parung-bogor'
  AND m.service_city_id IS NULL;

-- Driver existing → kota default (admin bisa ubah per driver)
UPDATE public.drivers d
SET service_city_id = sc.id
FROM public.service_cities sc
WHERE sc.slug = 'parung-bogor'
  AND d.service_city_id IS NULL;

COMMENT ON TABLE public.service_cities IS 'Wilayah layanan driver per kota';
COMMENT ON TABLE public.wallets IS 'Saldo customer, driver, merchant';
COMMENT ON COLUMN public.orders.payment_method IS 'gateway = Midtrans/stub, wallet = saldo';

-- Terapkan mutasi saldo atomik (amount positif = kredit, negatif = debit)
CREATE OR REPLACE FUNCTION public.wallet_apply_tx(
  p_owner_type public.wallet_owner_type,
  p_owner_id UUID,
  p_amount NUMERIC,
  p_tx_type public.wallet_tx_type,
  p_order_id UUID DEFAULT NULL,
  p_topup_ref TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet public.wallets%ROWTYPE;
  v_new_balance NUMERIC(14, 2);
  v_tx_id UUID;
BEGIN
  IF p_amount = 0 THEN
    RAISE EXCEPTION 'Amount tidak boleh nol';
  END IF;

  INSERT INTO public.wallets (owner_type, owner_id, balance)
  VALUES (p_owner_type, p_owner_id, 0)
  ON CONFLICT (owner_type, owner_id) DO NOTHING;

  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE owner_type = p_owner_type AND owner_id = p_owner_id
  FOR UPDATE;

  v_new_balance := v_wallet.balance + p_amount;
  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'Saldo tidak mencukupi';
  END IF;

  UPDATE public.wallets
  SET balance = v_new_balance, updated_at = NOW()
  WHERE id = v_wallet.id;

  INSERT INTO public.wallet_transactions (
    wallet_id, tx_type, amount, balance_after, order_id, topup_ref, note
  )
  VALUES (
    v_wallet.id, p_tx_type, p_amount, v_new_balance, p_order_id, p_topup_ref, p_note
  )
  RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.wallet_apply_tx TO service_role;
