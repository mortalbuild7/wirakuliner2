-- NIK driver untuk pencarian & legalitas (opsional saat pendaftaran awal).
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS nik TEXT;

CREATE INDEX IF NOT EXISTS drivers_nik_trgm_idx
  ON public.drivers (nik)
  WHERE nik IS NOT NULL;

COMMENT ON COLUMN public.drivers.nik IS 'Nomor Induk Kependudukan — 16 digit, opsional hingga verifikasi lengkap.';
