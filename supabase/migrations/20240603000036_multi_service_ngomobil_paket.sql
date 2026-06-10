-- =============================================================================
-- LAYANAN MULTI-SERVICE: NGOJEK · NGOMOBIL · PAKET
-- Anti-Redundancy: ENUM kategori driver terpisah dari jenis layanan order
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. ENUM jenis layanan order & kategori kendaraan fisik driver
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'service_type_enum') THEN
    CREATE TYPE public.service_type_enum AS ENUM ('NGOJEK', 'NGOMOBIL', 'PAKET');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'driver_service_category_enum') THEN
    CREATE TYPE public.driver_service_category_enum AS ENUM (
      'MOTOR_HYBRID',
      'MOBIL_PASSENGER',
      'MOBIL_CARGO'
    );
  END IF;
END $$;

COMMENT ON TYPE public.service_type_enum IS
  'Jenis layanan transit: motor (NGOJEK), mobil penumpang (NGOMOBIL), kirim barang (PAKET)';

COMMENT ON TYPE public.driver_service_category_enum IS
  'Kategori kendaraan fisik driver — satu driver satu kategori (anti-redundancy)';

-- ---------------------------------------------------------------------------
-- 2. Kolom orders: service_type + total_volume_cm3 (kubikasi paket)
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS service_type public.service_type_enum,
  ADD COLUMN IF NOT EXISTS total_volume_cm3 NUMERIC NOT NULL DEFAULT 0
    CHECK (total_volume_cm3 >= 0);

COMMENT ON COLUMN public.orders.service_type IS
  'NULL = pesanan kuliner; NGOJEK/NGOMOBIL/PAKET = layanan transit';

COMMENT ON COLUMN public.orders.total_volume_cm3 IS
  'Volume kubikasi barang (cm³) — dipakai dispatch PAKET & audit';

-- Backfill order ride existing dari prefix alamat
UPDATE public.orders
SET service_type = 'NGOJEK'
WHERE service_type IS NULL
  AND delivery_address LIKE '[NGOJEK]%';

-- ---------------------------------------------------------------------------
-- 3. Kolom drivers: service_category (kendaraan fisik)
-- ---------------------------------------------------------------------------
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS service_category public.driver_service_category_enum
    NOT NULL DEFAULT 'MOTOR_HYBRID';

COMMENT ON COLUMN public.drivers.service_category IS
  'MOTOR_HYBRID=motor, MOBIL_PASSENGER=mobil pribadi, MOBIL_CARGO=mobil box/pickup';

CREATE INDEX IF NOT EXISTS drivers_service_category_status_idx
  ON public.drivers (service_category, status)
  WHERE status = 'idle';

-- ---------------------------------------------------------------------------
-- 4. regional_tariffs: tarif per service_type dalam wilayah yang sama
-- ---------------------------------------------------------------------------
ALTER TABLE public.regional_tariffs
  ADD COLUMN IF NOT EXISTS service_type public.service_type_enum
    NOT NULL DEFAULT 'NGOJEK';

ALTER TABLE public.regional_tariffs
  DROP CONSTRAINT IF EXISTS regional_tariffs_province_id_city_id_key;

-- COALESCE city_id agar satu baris provinsi (city NULL) tidak duplikat
CREATE UNIQUE INDEX IF NOT EXISTS regional_tariffs_province_city_service_uidx
  ON public.regional_tariffs (
    province_id,
    COALESCE(city_id, -1),
    service_type
  );

-- Seed tarif NGOMOBIL & PAKET dari baseline NGOJEK (admin dapat override)
INSERT INTO public.regional_tariffs (
  province_id, city_id, service_type, base_fare, price_per_km, merchant_markup
)
SELECT
  rt.province_id,
  rt.city_id,
  st.svc,
  CASE st.svc
    WHEN 'NGOMOBIL' THEN ROUND(rt.base_fare * 1.5, 2)
    WHEN 'PAKET' THEN ROUND(rt.base_fare * 1.2, 2)
    ELSE rt.base_fare
  END,
  CASE st.svc
    WHEN 'NGOMOBIL' THEN ROUND(rt.price_per_km * 1.35, 2)
    WHEN 'PAKET' THEN ROUND(rt.price_per_km * 1.15, 2)
    ELSE rt.price_per_km
  END,
  rt.merchant_markup
FROM public.regional_tariffs rt
CROSS JOIN (
  VALUES ('NGOMOBIL'::public.service_type_enum), ('PAKET'::public.service_type_enum)
) AS st(svc)
WHERE rt.service_type = 'NGOJEK'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Tabel order_package_details (ekstensi PAKET)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_package_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  sender_phone TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  package_type TEXT NOT NULL,
  weight_kg NUMERIC NOT NULL CHECK (weight_kg > 0),
  length_cm NUMERIC NOT NULL CHECK (length_cm > 0),
  width_cm NUMERIC NOT NULL CHECK (width_cm > 0),
  height_cm NUMERIC NOT NULL CHECK (height_cm > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id)
);

COMMENT ON TABLE public.order_package_details IS
  'Detail pengiriman barang — 1:1 dengan order PAKET';

ALTER TABLE public.order_package_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_package_details_customer_read
  ON public.order_package_details
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_package_details.order_id
        AND o.customer_id = auth.uid()
    )
  );

CREATE POLICY order_package_details_driver_read
  ON public.order_package_details
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_package_details.order_id
        AND o.driver_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 6. RPC: insert transit order atomik (orders + order_package_details)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.insert_transit_order_atomic(
  p_order JSONB,
  p_package JSONB DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_service public.service_type_enum;
BEGIN
  v_service := (p_order ->> 'service_type')::public.service_type_enum;

  INSERT INTO public.orders (
    customer_id,
    merchant_id,
    total_product_amount,
    delivery_fee,
    is_outside_radius,
    negotiation_status,
    order_status,
    delivery_address,
    delivery_lat,
    delivery_lng,
    pickup_lat,
    pickup_lng,
    distance_km,
    service_city_id,
    province_id,
    city_id,
    service_type,
    total_volume_cm3,
    payment_method,
    payment_gateway
  ) VALUES (
    (p_order ->> 'customer_id')::UUID,
    (p_order ->> 'merchant_id')::UUID,
    COALESCE((p_order ->> 'total_product_amount')::NUMERIC, 0),
    (p_order ->> 'delivery_fee')::NUMERIC,
    COALESCE((p_order ->> 'is_outside_radius')::BOOLEAN, FALSE),
    COALESCE(p_order ->> 'negotiation_status', 'none')::public.negotiation_status,
    COALESCE(p_order ->> 'order_status', 'pending_payment')::public.order_status,
    p_order ->> 'delivery_address',
    (p_order ->> 'delivery_lat')::DOUBLE PRECISION,
    (p_order ->> 'delivery_lng')::DOUBLE PRECISION,
    NULLIF(p_order ->> 'pickup_lat', '')::DOUBLE PRECISION,
    NULLIF(p_order ->> 'pickup_lng', '')::DOUBLE PRECISION,
    NULLIF(p_order ->> 'distance_km', '')::NUMERIC,
    NULLIF(p_order ->> 'service_city_id', '')::UUID,
    NULLIF(p_order ->> 'province_id', '')::INTEGER,
    NULLIF(p_order ->> 'city_id', '')::INTEGER,
    v_service,
    COALESCE((p_order ->> 'total_volume_cm3')::NUMERIC, 0),
    NULLIF(p_order ->> 'payment_method', ''),
    NULLIF(p_order ->> 'payment_gateway', '')
  )
  RETURNING id INTO v_order_id;

  IF v_service = 'PAKET' AND p_package IS NOT NULL THEN
    INSERT INTO public.order_package_details (
      order_id,
      sender_name,
      sender_phone,
      recipient_name,
      recipient_phone,
      package_type,
      weight_kg,
      length_cm,
      width_cm,
      height_cm
    ) VALUES (
      v_order_id,
      p_package ->> 'sender_name',
      p_package ->> 'sender_phone',
      p_package ->> 'recipient_name',
      p_package ->> 'recipient_phone',
      p_package ->> 'package_type',
      (p_package ->> 'weight_kg')::NUMERIC,
      (p_package ->> 'length_cm')::NUMERIC,
      (p_package ->> 'width_cm')::NUMERIC,
      (p_package ->> 'height_cm')::NUMERIC
    );
  END IF;

  RETURN v_order_id;
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_transit_order_atomic TO service_role;

-- ---------------------------------------------------------------------------
-- 7. RPC: find_nearest_priority_drivers_v2 — KPI + kategori kendaraan fisik
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_driver_category_for_service(
  p_service public.service_type_enum,
  p_package_volume_cm3 NUMERIC DEFAULT 0
) RETURNS public.driver_service_category_enum
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_service
    WHEN 'NGOJEK' THEN 'MOTOR_HYBRID'::public.driver_service_category_enum
    WHEN 'NGOMOBIL' THEN 'MOBIL_PASSENGER'::public.driver_service_category_enum
    WHEN 'PAKET' THEN
      CASE
        WHEN COALESCE(p_package_volume_cm3, 0) > 60000 THEN
          'MOBIL_CARGO'::public.driver_service_category_enum
        ELSE
          'MOTOR_HYBRID'::public.driver_service_category_enum
      END
    ELSE 'MOTOR_HYBRID'::public.driver_service_category_enum
  END;
$$;

COMMENT ON FUNCTION public.resolve_driver_category_for_service IS
  'PAKET > 60000 cm³ (40×40×40) → MOBIL_CARGO; MOBIL_PASSENGER dilarang PAKET';

CREATE OR REPLACE FUNCTION public.find_nearest_priority_drivers_v2(
  lat_customer NUMERIC,
  lng_customer NUMERIC,
  max_radius_km NUMERIC,
  requested_service public.service_type_enum,
  package_volume_cm3 NUMERIC DEFAULT 0,
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

GRANT EXECUTE ON FUNCTION public.resolve_driver_category_for_service TO service_role;
GRANT EXECUTE ON FUNCTION public.find_nearest_priority_drivers_v2 TO service_role;
