-- Penawaran order bergilir: 1 order → 1 driver, timeout 30 detik lalu pindah ke driver lain
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS offered_driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS offered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS offer_skip_driver_ids UUID[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_orders_offered_driver
  ON public.orders (offered_driver_id)
  WHERE driver_id IS NULL AND offered_driver_id IS NOT NULL;
