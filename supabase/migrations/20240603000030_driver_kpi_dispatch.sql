-- =============================================================================
-- KPI Driver + Algoritma dispatch prioritas (Haversine + skor KPI 7 hari)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.driver_daily_kpis (
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  kpi_date DATE NOT NULL DEFAULT CURRENT_DATE,
  offers_sent INTEGER NOT NULL DEFAULT 0 CHECK (offers_sent >= 0),
  offers_accepted INTEGER NOT NULL DEFAULT 0 CHECK (offers_accepted >= 0),
  offers_declined INTEGER NOT NULL DEFAULT 0 CHECK (offers_declined >= 0),
  orders_completed INTEGER NOT NULL DEFAULT 0 CHECK (orders_completed >= 0),
  orders_cancelled_after_accept INTEGER NOT NULL DEFAULT 0 CHECK (orders_cancelled_after_accept >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (driver_id, kpi_date)
);

CREATE INDEX IF NOT EXISTS driver_daily_kpis_driver_date_idx
  ON public.driver_daily_kpis (driver_id, kpi_date DESC);

COMMENT ON TABLE public.driver_daily_kpis IS
  'Metrik harian driver untuk skor prioritas dispatch (rolling 7 hari)';

ALTER TABLE public.driver_daily_kpis ENABLE ROW LEVEL SECURITY;

-- Catat event KPI harian (idempoten per hari, upsert atomik)
CREATE OR REPLACE FUNCTION public.record_driver_kpi_event(
  p_driver_id UUID,
  p_event TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_driver_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.driver_daily_kpis (driver_id, kpi_date)
  VALUES (p_driver_id, CURRENT_DATE)
  ON CONFLICT (driver_id, kpi_date) DO NOTHING;

  CASE p_event
    WHEN 'offer_sent' THEN
      UPDATE public.driver_daily_kpis
      SET offers_sent = offers_sent + 1, updated_at = NOW()
      WHERE driver_id = p_driver_id AND kpi_date = CURRENT_DATE;
    WHEN 'offer_accepted' THEN
      UPDATE public.driver_daily_kpis
      SET offers_accepted = offers_accepted + 1, updated_at = NOW()
      WHERE driver_id = p_driver_id AND kpi_date = CURRENT_DATE;
    WHEN 'offer_declined' THEN
      UPDATE public.driver_daily_kpis
      SET offers_declined = offers_declined + 1, updated_at = NOW()
      WHERE driver_id = p_driver_id AND kpi_date = CURRENT_DATE;
    WHEN 'order_completed' THEN
      UPDATE public.driver_daily_kpis
      SET orders_completed = orders_completed + 1, updated_at = NOW()
      WHERE driver_id = p_driver_id AND kpi_date = CURRENT_DATE;
    WHEN 'order_cancelled_after_accept' THEN
      UPDATE public.driver_daily_kpis
      SET orders_cancelled_after_accept = orders_cancelled_after_accept + 1, updated_at = NOW()
      WHERE driver_id = p_driver_id AND kpi_date = CURRENT_DATE;
    ELSE
      RAISE EXCEPTION 'Event KPI tidak dikenal: %', p_event;
  END CASE;
END;
$$;

/**
 * Pencarian driver prioritas KPI dalam radius Haversine.
 *
 * Syarat ketersediaan (mapping ke skema WIRA):
 * - ONLINE  → status != 'offline'  (driver aktif di app)
 * - AVAILABLE → status = 'idle'    (tidak sedang mengantar)
 *
 * Rumus skor (0–100, tertinggi = prioritas tertinggi):
 *   Skor = (completion_rate × 100 × 0.4)
 *        + (acceptance_rate  × 100 × 0.3)
 *        + (average_rating   × 20  × 0.3)
 *
 * completion_rate & acceptance_rate = rolling 7 hari dari driver_daily_kpis.
 * average_rating = drivers.rating_avg (fallback 4.0 untuk driver baru).
 */
CREATE OR REPLACE FUNCTION public.find_nearest_priority_drivers(
  lat_customer NUMERIC,
  lng_customer NUMERIC,
  max_radius_km NUMERIC,
  p_skip_driver_ids UUID[] DEFAULT '{}',
  p_service_city_id UUID DEFAULT NULL,
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
  current_lng DOUBLE PRECISION
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH busy AS (
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
    LEFT JOIN kpi_7d kpi ON kpi.driver_id = d.id
    WHERE d.status = 'idle'
      AND d.current_lat IS NOT NULL
      AND d.current_lng IS NOT NULL
      AND (p_service_city_id IS NULL OR d.service_city_id = p_service_city_id)
      AND NOT (d.id = ANY (COALESCE(p_skip_driver_ids, '{}'::UUID[])))
      AND NOT EXISTS (SELECT 1 FROM busy b WHERE b.id = d.id)
      AND NOT EXISTS (SELECT 1 FROM pending_offer p WHERE p.id = d.id)
  ),
  scored AS (
    SELECT
      c.id AS driver_id,
      ROUND(c.dist_km::NUMERIC, 3) AS distance_km,
      ROUND(
        (c.completion_rate * 100 * 0.4)
        + (c.acceptance_rate * 100 * 0.3)
        + (c.average_rating * 20 * 0.3),
        2
      ) AS priority_score,
      ROUND(c.completion_rate, 4) AS completion_rate,
      ROUND(c.acceptance_rate, 4) AS acceptance_rate,
      ROUND(c.average_rating, 2) AS average_rating,
      c.current_lat,
      c.current_lng
    FROM candidates c
    WHERE c.dist_km <= GREATEST(max_radius_km, 0.1)
  )
  SELECT *
  FROM scored
  ORDER BY priority_score DESC, distance_km ASC
  LIMIT GREATEST(p_limit, 1);
$$;

GRANT EXECUTE ON FUNCTION public.record_driver_kpi_event TO service_role;
GRANT EXECUTE ON FUNCTION public.find_nearest_priority_drivers TO service_role;
