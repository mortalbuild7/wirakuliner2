-- Kolom is_active pada referensi `cities` — sinkron dengan zona layanan aktif.
ALTER TABLE public.cities
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS cities_province_active_idx
  ON public.cities (province_id, is_active)
  WHERE is_active = TRUE;

-- Backfill: kota aktif bila punya minimal satu service_cities aktif.
UPDATE public.cities c
SET is_active = TRUE
WHERE EXISTS (
  SELECT 1
  FROM public.service_cities sc
  WHERE sc.city_id = c.id
    AND sc.province_id = c.province_id
    AND sc.is_active = TRUE
);

COMMENT ON COLUMN public.cities.is_active IS
  'Status operasional referensi kota — disinkronkan saat zona layanan (service_cities) aktif.';
