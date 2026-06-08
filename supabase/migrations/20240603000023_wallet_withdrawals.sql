-- Penarikan saldo (customer, driver, merchant)

ALTER TYPE public.wallet_tx_type ADD VALUE IF NOT EXISTS 'withdraw_ewallet';
ALTER TYPE public.wallet_tx_type ADD VALUE IF NOT EXISTS 'withdraw_va';

CREATE TYPE public.wallet_withdraw_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'rejected'
);

CREATE TABLE IF NOT EXISTS public.wallet_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type public.wallet_owner_type NOT NULL,
  owner_id UUID NOT NULL,
  wallet_tx_id UUID REFERENCES public.wallet_transactions(id) ON DELETE SET NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL CHECK (method IN ('ewallet', 'va_bank')),
  destination TEXT NOT NULL,
  destination_name TEXT,
  status public.wallet_withdraw_status NOT NULL DEFAULT 'completed',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS wallet_withdrawals_owner_idx
  ON public.wallet_withdrawals (owner_type, owner_id, created_at DESC);

COMMENT ON TABLE public.wallet_withdrawals IS 'Riwayat penarikan saldo ke E-Wallet / rekening bank';
