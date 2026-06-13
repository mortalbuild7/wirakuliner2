-- =============================================================================
-- Perbaikan data wilayah driver Parung / Tajur Halang — sinkron master lokal
-- + kolom cache province_name / city_name untuk laporan admin
-- =============================================================================

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS province_name TEXT,
  ADD COLUMN IF NOT EXISTS city_name TEXT;

COMMENT ON COLUMN public.drivers.province_name IS
  'Cache nama provinsi operasional — disinkronkan dari master wilayah / GPS.';
COMMENT ON COLUMN public.drivers.city_name IS
  'Cache nama kota/kabupaten operasional — disinkronkan dari master wilayah / GPS.';

-- Kabupaten Bogor di bawah provinsi Jawa Barat yang sudah ada (hindari duplikat nama provinsi)
INSERT INTO public.cities (id, province_id, name)
SELECT
  3201,
  p.id,
  'Kabupaten Bogor'
FROM public.provinces p
WHERE LOWER(p.name) = 'jawa barat'
  AND NOT EXISTS (
    SELECT 1
    FROM public.cities c
    WHERE c.province_id = p.id
      AND LOWER(c.name) = 'kabupaten bogor'
  )
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      province_id = EXCLUDED.province_id;

-- Zona layanan Parung → Jawa Barat / Kabupaten Bogor (bukan DKI Jakarta)
UPDATE public.service_cities sc
SET
  province_id = p.id,
  city_id = c.id
FROM public.provinces p
CROSS JOIN public.cities c
WHERE sc.slug = 'parung-bogor'
  AND LOWER(p.name) = 'jawa barat'
  AND c.name = 'Kabupaten Bogor'
  AND c.province_id = p.id;

-- Driver di Parung, Tajur Halang, atau zona parung-bogor — perbaiki metadata wilayah
WITH jabar AS (
  SELECT id FROM public.provinces WHERE LOWER(name) = 'jawa barat' LIMIT 1
),
bogor_kab AS (
  SELECT c.id
  FROM public.cities c
  JOIN jabar j ON j.id = c.province_id
  WHERE c.name = 'Kabupaten Bogor'
  LIMIT 1
),
parung_sc AS (
  SELECT id FROM public.service_cities WHERE slug = 'parung-bogor' LIMIT 1
),
parung_center AS (
  SELECT
    COALESCE(sc.center_lat, -6.42776)::DOUBLE PRECISION AS lat,
    COALESCE(sc.center_lng, 106.727392)::DOUBLE PRECISION AS lng
  FROM public.service_cities sc
  WHERE sc.slug = 'parung-bogor'
  LIMIT 1
)
UPDATE public.drivers d
SET
  province_id = j.id,
  province_name = 'Jawa Barat',
  city_id = bk.id,
  city_name = 'Kabupaten Bogor',
  operational_cluster_id = COALESCE(
    d.operational_cluster_id,
    (
      SELECT sc2.operational_cluster_id
      FROM public.service_cities sc2
      WHERE sc2.slug = 'parung-bogor'
      LIMIT 1
    )
  )
FROM jabar j, bogor_kab bk, parung_sc ps, parung_center pc
WHERE j.id IS NOT NULL
  AND bk.id IS NOT NULL
  AND (
    d.service_city_id = ps.id
    OR d.registration_service_city_id = ps.id
    OR (
      d.current_lat IS NOT NULL
      AND d.current_lng IS NOT NULL
      AND public.haversine_km(
        d.current_lat,
        d.current_lng,
        pc.lat,
        pc.lng
      ) <= 25
    )
    OR LOWER(COALESCE(d.city_name, '')) LIKE '%parung%'
    OR LOWER(COALESCE(d.city_name, '')) LIKE '%tajur%'
    OR LOWER(COALESCE(d.city_name, '')) LIKE '%bogor%'
    OR LOWER(COALESCE(d.province_name, '')) LIKE '%jakarta%'
    OR d.province_id IN (
      SELECT id FROM public.provinces WHERE LOWER(name) LIKE '%jakarta%'
    )
  );

-- Sinkron ulang PostGIS point dari lat/lng (agar ST_DWithin radius 3 km akurat)
UPDATE public.drivers
SET current_location = ST_SetSRID(
  ST_MakePoint(current_lng::DOUBLE PRECISION, current_lat::DOUBLE PRECISION),
  4326
)::geography
WHERE current_lat IS NOT NULL
  AND current_lng IS NOT NULL;

-- Backfill nama cache untuk driver lain yang sudah punya FK wilayah
UPDATE public.drivers d
SET
  province_name = COALESCE(d.province_name, p.name),
  city_name = COALESCE(d.city_name, c.name)
FROM public.provinces p
LEFT JOIN public.cities c ON c.id = d.city_id
WHERE d.province_id = p.id
  AND (d.province_name IS NULL OR d.city_name IS NULL);
