-- =============================================================================
-- RIDE MATCHING v4 — Intra-Provinsi + Borderline Buffer (30–50 km)
-- =============================================================================
-- registration_province_id = provinsi pendaftaran driver (komisi City Admin)
-- pickup_province_id       = provinsi titik jemput customer
-- border_surcharge         = biaya lintas wilayah Rp 5.000–10.000
-- =============================================================================

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS registration_province_id INTEGER
    REFERENCES public.provinces(id) ON DELETE SET NULL;

UPDATE public.drivers
SET registration_province_id = province_id
WHERE registration_province_id IS NULL AND province_id IS NOT NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pickup_province_id INTEGER
    REFERENCES public.provinces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_borderline_crossing BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS border_surcharge INTEGER NOT NULL DEFAULT 0
    CHECK (border_surcharge >= 0),
  ADD COLUMN IF NOT EXISTS matching_mode TEXT
    CHECK (
      matching_mode IS NULL
      OR matching_mode IN ('intra_cluster', 'intra_province', 'borderline')
    );

COMMENT ON COLUMN public.drivers.registration_province_id IS
  'Provinsi pendaftaran driver — dasar intra-provinsi & hak komisi City Admin.';
COMMENT ON COLUMN public.orders.pickup_province_id IS
  'Provinsi administratif titik jemput customer.';
COMMENT ON COLUMN public.orders.is_borderline_crossing IS
  'TRUE jika order lintas provinsi / di luar cabang resmi (buffer 30–50 km).';
COMMENT ON COLUMN public.orders.border_surcharge IS
  'Biaya tambahan lintas wilayah (Rp 5.000–10.000) untuk kompensasi driver.';

-- Indeks spatial bbox + provinsi untuk dispatch <200ms
CREATE INDEX IF NOT EXISTS idx_drivers_province_idle_gps
  ON public.drivers (registration_province_id, status)
  WHERE status = 'idle'
    AND current_lat IS NOT NULL
    AND current_lng IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_drivers_gps_bbox_idle
  ON public.drivers (current_lat, current_lng)
  WHERE status = 'idle'
    AND current_lat IS NOT NULL
    AND current_lng IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_pickup_province
  ON public.orders (pickup_province_id)
  WHERE pickup_province_id IS NOT NULL;

-- Bbox delta ~0.45° ≈ 50 km di lintang Indonesia
CREATE OR REPLACE FUNCTION public.bbox_delta_for_radius_km(radius_km NUMERIC)
RETURNS DOUBLE PRECISION
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT GREATEST(radius_km, 1)::DOUBLE PRECISION / 111.0;
$$;

/**
 * RPC v4 — Matching Ride Algorithm:
 * 1. intra_cluster  : cluster sama + radius kecil (5 km default)
 * 2. intra_province : provinsi jemput = registration_province_id driver + radius 15 km
 * 3. borderline     : cabang resmi tidak ada / lintas provinsi + buffer 30–50 km
 */
CREATE OR REPLACE FUNCTION public.find_nearest_priority_drivers_v4(
  lat_customer NUMERIC,
  lng_customer NUMERIC,
  requested_service public.service_type_enum DEFAULT 'NGOJEK',
  package_volume_cm3 NUMERIC DEFAULT 0,
  p_skip_driver_ids UUID[] DEFAULT '{}',
  p_pickup_province_id INTEGER DEFAULT NULL,
  p_has_official_branch BOOLEAN DEFAULT TRUE,
  p_operational_cluster_id UUID DEFAULT NULL,
  p_cluster_radius_km NUMERIC DEFAULT 5,
  p_intra_province_radius_km NUMERIC DEFAULT 15,
  p_borderline_buffer_km NUMERIC DEFAULT 40,
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
  service_category public.driver_service_category_enum,
  match_mode TEXT,
  driver_province_id INTEGER,
  is_borderline BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      GREATEST(p_cluster_radius_km, 0.5) AS cluster_r,
      GREATEST(p_intra_province_radius_km, 1) AS prov_r,
      GREATEST(LEAST(p_borderline_buffer_km, 50), 30) AS border_r,
      GREATEST(
        public.bbox_delta_for_radius_km(
          GREATEST(
            GREATEST(p_cluster_radius_km, p_intra_province_radius_km),
            LEAST(p_borderline_buffer_km, 50)
          )
        ),
        0.05
      ) AS bbox_d
  ),
  target AS (
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
  raw AS (
    SELECT
      d.id,
      d.current_lat,
      d.current_lng,
      d.service_category,
      COALESCE(d.registration_province_id, d.province_id) AS reg_province_id,
      d.operational_cluster_id,
      public.haversine_km(
        d.current_lat,
        d.current_lng,
        lat_customer::DOUBLE PRECISION,
        lng_customer::DOUBLE PRECISION
      ) AS dist_km,
      COALESCE(kpi.completion_rate, 0.90) AS completion_rate,
      COALESCE(kpi.acceptance_rate, 0.85) AS acceptance_rate,
      COALESCE(NULLIF(d.rating_avg, 0), 4.0) AS average_rating,
      p.cluster_r,
      p.prov_r,
      p.border_r
    FROM public.drivers d
    CROSS JOIN target t
    CROSS JOIN params p
    LEFT JOIN kpi_7d kpi ON kpi.driver_id = d.id
    WHERE d.status = 'idle'
      AND d.current_lat IS NOT NULL
      AND d.current_lng IS NOT NULL
      AND d.service_category = t.category
      AND d.gps_trust IS DISTINCT FROM 'SUSPICIOUS'
      AND NOT (d.id = ANY (COALESCE(p_skip_driver_ids, '{}'::UUID[])))
      AND NOT EXISTS (SELECT 1 FROM busy b WHERE b.id = d.id)
      AND NOT EXISTS (SELECT 1 FROM pending_offer po WHERE po.id = d.id)
      AND d.current_lat BETWEEN (lat_customer::DOUBLE PRECISION - p.bbox_d)
                            AND (lat_customer::DOUBLE PRECISION + p.bbox_d)
      AND d.current_lng BETWEEN (lng_customer::DOUBLE PRECISION - p.bbox_d)
                            AND (lng_customer::DOUBLE PRECISION + p.bbox_d)
  ),
  classified AS (
    SELECT
      r.*,
      CASE
        WHEN p_has_official_branch
          AND p_operational_cluster_id IS NOT NULL
          AND r.operational_cluster_id = p_operational_cluster_id
          AND r.dist_km <= r.cluster_r
          THEN 'intra_cluster'
        WHEN p_pickup_province_id IS NOT NULL
          AND r.reg_province_id = p_pickup_province_id
          AND r.dist_km <= r.prov_r
          THEN 'intra_province'
        WHEN (NOT p_has_official_branch OR (
            p_pickup_province_id IS NOT NULL
            AND r.reg_province_id IS DISTINCT FROM p_pickup_province_id
          ))
          AND r.dist_km <= r.border_r
          THEN 'borderline'
        ELSE NULL
      END AS match_mode
    FROM raw r
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
      c.service_category,
      c.match_mode,
      c.reg_province_id AS driver_province_id,
      (c.match_mode = 'borderline') AS is_borderline
    FROM classified c
    WHERE c.match_mode IS NOT NULL
  )
  SELECT *
  FROM scored
  ORDER BY
    CASE match_mode
      WHEN 'intra_cluster' THEN 1
      WHEN 'intra_province' THEN 2
      WHEN 'borderline' THEN 3
      ELSE 4
    END,
    priority_score DESC,
    distance_km ASC
  LIMIT GREATEST(p_limit, 1);
$$;

GRANT EXECUTE ON FUNCTION public.find_nearest_priority_drivers_v4 TO service_role;

-- RLS: City Admin komisi berdasarkan registration_service_city_id (bukan lokasi order)
DROP POLICY IF EXISTS drivers_regional_admin_select ON public.drivers;
CREATE POLICY drivers_regional_admin_select ON public.drivers
  FOR SELECT TO authenticated
  USING (
    NOT EXISTS (
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
        AND COALESCE(drivers.registration_province_id, drivers.province_id) = p.province_id
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

-- Order: City Admin lihat order driver terdaftar di kotanya (komisi lintas batas)
DROP POLICY IF EXISTS orders_city_admin_driver_registration ON public.orders;
CREATE POLICY orders_city_admin_driver_registration ON public.orders
  FOR SELECT TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.admin_role = 'CITY_ADMIN'
    )
    OR driver_id IS NULL
    OR EXISTS (
      SELECT 1
      FROM public.drivers d
      JOIN public.profiles p ON p.id = auth.uid() AND p.admin_role = 'CITY_ADMIN'
      WHERE d.id = orders.driver_id
        AND (
          d.registration_service_city_id = ANY (public.admin_registration_service_city_ids())
          OR (d.registration_service_city_id IS NULL AND d.city_id = p.city_id)
        )
    )
  );
