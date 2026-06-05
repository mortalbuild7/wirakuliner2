-- Moderasi admin: customer (peringatan/suspend/block) & merchant (suspend/putus mitra)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('active', 'warned', 'suspended', 'blocked')),
  ADD COLUMN IF NOT EXISTS admin_note TEXT,
  ADD COLUMN IF NOT EXISTS warned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ;

ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS admin_suspended BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS admin_note TEXT;

-- Admin boleh memutus hubungan mitra (owner dikosongkan)
ALTER TABLE public.merchants
  ALTER COLUMN owner_id DROP NOT NULL;

COMMENT ON COLUMN public.profiles.account_status IS 'active|warned|suspended|blocked — moderasi customer';
COMMENT ON COLUMN public.merchants.admin_suspended IS 'Suspend admin: toko tidak tampil & owner tidak bisa operasikan';
COMMENT ON COLUMN public.merchants.admin_note IS 'Catatan internal admin untuk toko';

CREATE INDEX IF NOT EXISTS idx_profiles_account_status ON public.profiles (account_status)
  WHERE role = 'customer';

CREATE INDEX IF NOT EXISTS idx_merchants_admin_suspended ON public.merchants (admin_suspended)
  WHERE admin_suspended = TRUE;
