-- =============================================================================
-- CLUSTER OPERASIONAL & GEOFENCING — NGOJEK / NGOMOBIL lintas kota (Jabodetabek)
-- =============================================================================
-- registration_service_city_id = kota pendaftaran (City Admin laporan)
-- operational_cluster_id       = cluster bebas narik (GPS + radius 5 km)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.operational_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  center_lat DOUBLE PRECISION NOT NULL,
  center_lng DOUBLE PRECISION NOT NULL,
  radius_km NUMERIC NOT NULL DEFAULT 45 CHECK (radius_km > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.operational_clusters IS
  'Cluster operasional fluid — driver boleh narik lintas kota administratif dalam cluster yang sama.';

INSERT INTO public.operational_clusters (code, name, slug, center_lat, center_lng, radius_km)
VALUES
  ('JABODETABEK', 'Jabodetabek', 'jabodetabek', -6.2088, 106.8456, 45),
  ('BANDUNG_RAYA', 'Bandung Raya', 'bandung-raya', -6.9175, 107.6191, 35),
  ('SURABAYA_RAYA', 'Surabaya Raya', 'surabaya-raya', -7.2575, 112.7521, 35),
  ('SEMARANG_RAYA', 'Semarang Raya', 'semarang-raya', -6.9667, 110.4167, 30)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.service_cities
  ADD COLUMN IF NOT EXISTS operational_cluster_id UUID
    REFERENCES public.operational_clusters(id) ON DELETE SET NULL;

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS registration_service_city_id UUID
    REFERENCES public.service_cities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS operational_cluster_id UUID
    REFERENCES public.operational_clusters(id) ON DELETE SET NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS operational_cluster_id UUID
    REFERENCES public.operational_clusters(id) ON DELETE SET NULL;

-- Backfill: kota pendaftaran = service_city_id saat ini
UPDATE public.drivers
SET registration_service_city_id = service_city_id
WHERE registration_service_city_id IS NULL
  AND service_city_id IS NOT NULL;

-- Petakan zona layanan ke cluster
UPDATE public.service_cities sc
SET operational_cluster_id = oc.id
FROM public.operational_clusters oc
WHERE sc.operational_cluster_id IS NULL
  AND (
    (sc.slug IN ('parung-bogor', 'jakarta-selatan') AND oc.code = 'JABODETABEK')
    OR (sc.slug = 'bandung' AND oc.code = 'BANDUNG_RAYA')
    OR (sc.slug IN ('kota-malang', 'surabaya') AND oc.code = 'SURABAYA_RAYA')
    OR (sc.slug = 'kota-semarang' AND oc.code = 'SEMARANG_RAYA')
  );

-- Backfill cluster driver dari zona pendaftaran
UPDATE public.drivers d
SET operational_cluster_id = sc.operational_cluster_id
FROM public.service_cities sc
WHERE d.operational_cluster_id IS NULL
  AND sc.id = COALESCE(d.registration_service_city_id, d.service_city_id);

-- Indeks dispatch <200ms: cluster + status idle + GPS
CREATE INDEX IF NOT EXISTS idx_drivers_cluster_idle_gps
  ON public.drivers (operational_cluster_id, status)
  WHERE status = 'idle'
    AND current_lat IS NOT NULL
    AND current_lng IS NOT NULL
    AND operational_cluster_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_drivers_registration_service_city
  ON public.drivers (registration_service_city_id)
  WHERE registration_service_city_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_operational_cluster
  ON public.orders (operational_cluster_id)
  WHERE operational_cluster_id IS NOT NULL;

-- Resolve cluster dari koordinat (Haversine ke pusat cluster)
CREATE OR REPLACE FUNCTION public.resolve_operational_cluster_for_coords(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION
) RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT oc.id
  FROM public.operational_clusters oc
  WHERE oc.is_active = TRUE
    AND public.haversine_km(p_lat, p_lng, oc.center_lat, oc.center_lng) <= oc.radius_km
  ORDER BY public.haversine_km(p_lat, p_lng, oc.center_lat, oc.center_lng)
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.resolve_operational_cluster_for_coords IS
  'Tentukan cluster operasional dari koordinat jemput — tidak memakai nama kota administratif.';

-- RPC v3: cluster + radius 5 km (NGOJEK/NGOMOBIL) — bbox prefilter untuk performa
CREATE OR REPLACE FUNCTION public.find_nearest_priority_drivers_v3(
  lat_customer NUMERIC,
  lng_customer NUMERIC,
  max_radius_km NUMERIC DEFAULT 5,
  requested_service public.service_type_enum DEFAULT 'NGOJEK',
  package_volume_cm3 NUMERIC DEFAULT 0,
  p_skip_driver_ids UUID[] DEFAULT '{}',
  p_operational_cluster_id UUID DEFAULT NULL,
  p_offer_timeout_seconds INTEGER DEFAULT 15,
  p_limit INTEGER DEFAULT 20
) RETURNS TABLE (
  driver_id UUID,
  distance_km NUMERIC,
  priority_score NUMERIC,
  completion_rate NUMERIC,
  acceptance_rate NUMERIC,
  average_rating NUMERIC,
  current_lat DOUBLE PRECISION,
  current_lng DOUBLE PRECISION,
  service_category public.driver_service_category_enum
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH target AS (
    SELECT public.resolve_driver_category_for_service(
      requested_service,
      package_volume_cm3
    ) AS category
  ),
  busy AS (
    SELECT DISTINCT o.driver_id AS id
    FROM public.orders o
    WHERE o.driver_id IS NOT NULL
      AND o.order_status IN ('paid', 'preparing', 'ready_for_pickup', 'on_the_way')
  ),
  pending_offer AS (
    SELECT DISTINCT o.offered_driver_id AS id
    FROM public.orders o
    WHERE o.driver_id IS NULL
      AND o.offered_driver_id IS NOT NULL
      AND o.offered_at IS NOT NULL
      AND o.offered_at > NOW() - (GREATEST(p_offer_timeout_seconds, 5) || ' seconds')::INTERVAL
  ),
  kpi_7d AS (
    SELECT
      k.driver_id,
      COALESCE(
        SUM(k.orders_completed)::NUMERIC
          / NULLIF(SUM(k.orders_completed + k.orders_cancelled_after_accept), 0),
        0.90
      ) AS completion_rate,
      COALESCE(
        SUM(k.offers_accepted)::NUMERIC
          / NULLIF(SUM(k.offers_sent), 0),
        0.85
      ) AS acceptance_rate
    FROM public.driver_daily_kpis k
    WHERE k.kpi_date >= CURRENT_DATE - INTERVAL '7 days'
    GROUP BY k.driver_id
  ),
  candidates AS (
    SELECT
      d.id,
      d.current_lat,
      d.current_lng,
      d.service_category,
      public.haversine_km(
        d.current_lat,
        d.current_lng,
        lat_customer::DOUBLE PRECISION,
        lng_customer::DOUBLE PRECISION
      ) AS dist_km,
      COALESCE(kpi.completion_rate, 0.90) AS completion_rate,
      COALESCE(kpi.acceptance_rate, 0.85) AS acceptance_rate,
      COALESCE(NULLIF(d.rating_avg, 0), 4.0) AS average_rating
    FROM public.drivers d
    CROSS JOIN target t
    LEFT JOIN kpi_7d kpi ON kpi.driver_id = d.id
    WHERE d.status = 'idle'
      AND d.current_lat IS NOT NULL
      AND d.current_lng IS NOT NULL
      AND d.service_category = t.category
      AND d.gps_trust IS DISTINCT FROM 'SUSPICIOUS'
      AND (p_operational_cluster_id IS NULL OR d.operational_cluster_id = p_operational_cluster_id)
      AND NOT (d.id = ANY (COALESCE(p_skip_driver_ids, '{}'::UUID[])))
      AND NOT EXISTS (SELECT 1 FROM busy b WHERE b.id = d.id)
      AND NOT EXISTS (SELECT 1 FROM pending_offer p WHERE p.id = d.id)
      -- Bbox prefilter ~5.5 km — memangkas kandidat sebelum Haversine penuh
      AND d.current_lat BETWEEN (lat_customer::DOUBLE PRECISION - 0.05)
                            AND (lat_customer::DOUBLE PRECISION + 0.05)
      AND d.current_lng BETWEEN (lng_customer::DOUBLE PRECISION - 0.05)
                            AND (lng_customer::DOUBLE PRECISION + 0.05)
  ),
  scored AS (
    SELECT
      c.id AS driver_id,
      ROUND(c.dist_km::NUMERIC, 3) AS distance_km,
      ROUND(
        (c.completion_rate * 0.4)
        + (c.acceptance_rate * 0.3)
        + ((c.average_rating * 20) * 0.3),
        2
      ) AS priority_score,
      ROUND(c.completion_rate, 4) AS completion_rate,
      ROUND(c.acceptance_rate, 4) AS acceptance_rate,
      ROUND(c.average_rating, 2) AS average_rating,
      c.current_lat,
      c.current_lng,
      c.service_category
    FROM candidates c
    WHERE c.dist_km <= GREATEST(max_radius_km, 0.1)
  )
  SELECT *
  FROM scored
  ORDER BY priority_score DESC, distance_km ASC
  LIMIT GREATEST(p_limit, 1);
$$;

GRANT EXECUTE ON FUNCTION public.resolve_operational_cluster_for_coords TO service_role;
GRANT EXECUTE ON FUNCTION public.find_nearest_priority_drivers_v3 TO service_role;

-- RLS: City Admin hanya SELECT driver terdaftar di kota cabangnya (laporan/komisi)
CREATE OR REPLACE FUNCTION public.admin_registration_service_city_ids()
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    array_agg(sc.id) FILTER (WHERE sc.id IS NOT NULL),
    '{}'::UUID[]
  )
  FROM public.profiles p
  JOIN public.service_cities sc
    ON sc.city_id = p.city_id
   AND sc.is_active = TRUE
  WHERE p.id = auth.uid()
    AND p.role = 'admin'
    AND p.admin_role = 'CITY_ADMIN'
    AND p.city_id IS NOT NULL;
$$;

DROP POLICY IF EXISTS drivers_regional_admin_select ON public.drivers;
CREATE POLICY drivers_regional_admin_select ON public.drivers
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
        AND p.admin_role IN ('CITY_ADMIN', 'PROVINCE_ADMIN')
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
        AND p.admin_role = 'SUPER_ADMIN'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
        AND p.admin_role = 'PROVINCE_ADMIN'
        AND p.province_id IS NOT NULL
        AND drivers.province_id = p.province_id
    )
    OR (
      drivers.registration_service_city_id = ANY (public.admin_registration_service_city_ids())
      OR (
        drivers.registration_service_city_id IS NULL
        AND drivers.city_id = (
          SELECT p.city_id FROM public.profiles p
          WHERE p.id = auth.uid() AND p.admin_role = 'CITY_ADMIN'
          LIMIT 1
        )
      )
    )
  );

COMMENT ON COLUMN public.drivers.registration_service_city_id IS
  'Kota pendaftaran driver (mis. Bogor Parung) — dasar laporan City Admin.';
COMMENT ON COLUMN public.drivers.operational_cluster_id IS
  'Cluster operasional bebas narik — dispatch NGOJEK/NGOMOBIL memfilter cluster + GPS 5 km.';
