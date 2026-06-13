-- =============================================================================
-- Customer driver proximity — radius ketat 3 km (GPS pickup)
-- COUNT + dispatch tanpa perluasan provinsi / borderline buffer.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.count_idle_drivers_within_radius(
  lat_customer NUMERIC,
  lng_customer NUMERIC,
  radius_km NUMERIC DEFAULT 3,
  requested_service public.service_type_enum DEFAULT 'NGOJEK',
  package_volume_cm3 NUMERIC DEFAULT 0
) RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      GREATEST(LEAST(radius_km, 10), 0.5) AS r,
      GREATEST(public.bbox_delta_for_radius_km(GREATEST(LEAST(radius_km, 10), 0.5)), 0.03) AS bbox_d
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
      AND o.offered_at > NOW() - INTERVAL '15 seconds'
  )
  SELECT COUNT(*)::INTEGER
  FROM public.drivers d
  CROSS JOIN target t
  CROSS JOIN params p
  WHERE d.status = 'idle'
    AND d.current_lat IS NOT NULL
    AND d.current_lng IS NOT NULL
    AND d.service_category = t.category
    AND d.gps_trust IS DISTINCT FROM 'SUSPICIOUS'
    AND NOT EXISTS (SELECT 1 FROM busy b WHERE b.id = d.id)
    AND NOT EXISTS (SELECT 1 FROM pending_offer po WHERE po.id = d.id)
    AND d.current_lat BETWEEN (lat_customer::DOUBLE PRECISION - p.bbox_d)
                          AND (lat_customer::DOUBLE PRECISION + p.bbox_d)
    AND d.current_lng BETWEEN (lng_customer::DOUBLE PRECISION - p.bbox_d)
                          AND (lng_customer::DOUBLE PRECISION + p.bbox_d)
    AND public.haversine_km(
      d.current_lat,
      d.current_lng,
      lat_customer::DOUBLE PRECISION,
      lng_customer::DOUBLE PRECISION
    ) <= p.r;
$$;

CREATE OR REPLACE FUNCTION public.find_nearest_priority_drivers_customer(
  lat_customer NUMERIC,
  lng_customer NUMERIC,
  max_radius_km NUMERIC DEFAULT 3,
  requested_service public.service_type_enum DEFAULT 'NGOJEK',
  package_volume_cm3 NUMERIC DEFAULT 0,
  p_skip_driver_ids UUID[] DEFAULT '{}',
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
  WITH params AS (
    SELECT
      GREATEST(LEAST(max_radius_km, 10), 0.5) AS r,
      GREATEST(public.bbox_delta_for_radius_km(GREATEST(LEAST(max_radius_km, 10), 0.5)), 0.03) AS bbox_d
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
      COALESCE(NULLIF(d.rating_avg, 0), 4.0) AS average_rating,
      p.r
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
    WHERE c.dist_km <= c.r
  )
  SELECT *
  FROM scored
  ORDER BY priority_score DESC, distance_km ASC
  LIMIT GREATEST(p_limit, 1);
$$;

GRANT EXECUTE ON FUNCTION public.count_idle_drivers_within_radius TO service_role;
GRANT EXECUTE ON FUNCTION public.find_nearest_priority_drivers_customer TO service_role;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_matching_mode_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_matching_mode_check CHECK (
    matching_mode IS NULL
    OR matching_mode IN (
      'intra_cluster',
      'intra_province',
      'borderline',
      'customer_proximity'
    )
  );

COMMENT ON FUNCTION public.count_idle_drivers_within_radius IS
  'Hitung driver idle dalam radius GPS ketat (default 3 km) — pre-check customer NGOJEK/NGOMOBIL.';
COMMENT ON FUNCTION public.find_nearest_priority_drivers_customer IS
  'Dispatch customer ride — hanya driver dalam radius GPS ketat, tanpa perluasan provinsi.';
