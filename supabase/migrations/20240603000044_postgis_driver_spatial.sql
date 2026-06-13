-- =============================================================================
-- PostGIS — spatial index driver GPS untuk query radius 3 km skala besar
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS current_location geography(POINT, 4326);

COMMENT ON COLUMN public.drivers.current_location IS
  'Titik GPS driver (SRID 4326) — sinkron dari current_lat/current_lng; dipakai ST_DWithin + GIST.';

UPDATE public.drivers
SET current_location = ST_SetSRID(
  ST_MakePoint(current_lng::DOUBLE PRECISION, current_lat::DOUBLE PRECISION),
  4326
)::geography
WHERE current_lat IS NOT NULL
  AND current_lng IS NOT NULL
  AND current_location IS NULL;

CREATE OR REPLACE FUNCTION public.sync_driver_current_location()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.current_lat IS NOT NULL AND NEW.current_lng IS NOT NULL THEN
    NEW.current_location := ST_SetSRID(
      ST_MakePoint(NEW.current_lng::DOUBLE PRECISION, NEW.current_lat::DOUBLE PRECISION),
      4326
    )::geography;
  ELSE
    NEW.current_location := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_drivers_sync_current_location ON public.drivers;
CREATE TRIGGER trg_drivers_sync_current_location
  BEFORE INSERT OR UPDATE OF current_lat, current_lng
  ON public.drivers
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_driver_current_location();

DROP INDEX IF EXISTS idx_drivers_current_location_gist_idle;
CREATE INDEX idx_drivers_current_location_gist_idle
  ON public.drivers
  USING GIST (current_location)
  WHERE status = 'idle'
    AND current_location IS NOT NULL;

DROP INDEX IF EXISTS idx_drivers_current_location_gist_online;
CREATE INDEX idx_drivers_current_location_gist_online
  ON public.drivers
  USING GIST (current_location)
  WHERE status IN ('idle', 'delivering')
    AND current_location IS NOT NULL;

-- COUNT driver idle — ST_DWithin memanfaatkan indeks GIST (radius meter)
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
      GREATEST(LEAST(radius_km, 10), 0.5) * 1000.0 AS radius_m,
      ST_SetSRID(
        ST_MakePoint(lng_customer::DOUBLE PRECISION, lat_customer::DOUBLE PRECISION),
        4326
      )::geography AS pickup_point
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
    AND d.current_location IS NOT NULL
    AND d.service_category = t.category
    AND d.gps_trust IS DISTINCT FROM 'SUSPICIOUS'
    AND NOT EXISTS (SELECT 1 FROM busy b WHERE b.id = d.id)
    AND NOT EXISTS (SELECT 1 FROM pending_offer po WHERE po.id = d.id)
    AND ST_DWithin(d.current_location, p.pickup_point, p.radius_m);
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
      GREATEST(LEAST(max_radius_km, 10), 0.5) * 1000.0 AS radius_m,
      ST_SetSRID(
        ST_MakePoint(lng_customer::DOUBLE PRECISION, lat_customer::DOUBLE PRECISION),
        4326
      )::geography AS pickup_point
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
      ST_Distance(d.current_location, p.pickup_point) / 1000.0 AS dist_km,
      COALESCE(kpi.completion_rate, 0.90) AS completion_rate,
      COALESCE(kpi.acceptance_rate, 0.85) AS acceptance_rate,
      COALESCE(NULLIF(d.rating_avg, 0), 4.0) AS average_rating,
      p.radius_m
    FROM public.drivers d
    CROSS JOIN target t
    CROSS JOIN params p
    LEFT JOIN kpi_7d kpi ON kpi.driver_id = d.id
    WHERE d.status = 'idle'
      AND d.current_location IS NOT NULL
      AND d.service_category = t.category
      AND d.gps_trust IS DISTINCT FROM 'SUSPICIOUS'
      AND NOT (d.id = ANY (COALESCE(p_skip_driver_ids, '{}'::UUID[])))
      AND NOT EXISTS (SELECT 1 FROM busy b WHERE b.id = d.id)
      AND NOT EXISTS (SELECT 1 FROM pending_offer po WHERE po.id = d.id)
      AND ST_DWithin(d.current_location, p.pickup_point, p.radius_m)
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
  )
  SELECT *
  FROM scored
  ORDER BY priority_score DESC, distance_km ASC
  LIMIT GREATEST(p_limit, 1);
$$;
