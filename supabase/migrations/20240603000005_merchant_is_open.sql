-- Status buka/tutup harian toko (merchant toggle, terpisah dari is_active admin)
ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_merchants_is_open ON public.merchants (is_open) WHERE is_active = TRUE;

COMMENT ON COLUMN public.merchants.is_open IS 'TRUE = toko buka (customer bisa pesan); FALSE = tutup (etalase hanya lihat)';
