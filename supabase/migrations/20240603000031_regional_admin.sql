-- =============================================================================
-- ADMIN REGIONAL 3 TINGKAT — SUPER / PROVINCE / CITY + RLS RESTRICTIVE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.provinces (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS public.cities (
  id INTEGER PRIMARY KEY,
  province_id INTEGER NOT NULL REFERENCES public.provinces(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  UNIQUE (province_id, name)
);

INSERT INTO public.provinces (id, name) VALUES
  (31, 'Jawa Barat'),
  (32, 'Jawa Timur'),
  (35, 'Jawa Tengah')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.cities (id, province_id, name) VALUES
  (3271, 31, 'Kota Bogor'),
  (3275, 31, 'Kota Depok'),
  (3578, 32, 'Kota Malang'),
  (3579, 32, 'Kota Surabaya'),
  (3374, 35, 'Kota Semarang')
ON CONFLICT (id) DO NOTHING;

-- Tier admin regional (profiles.role tetap 'admin' untuk kompatibilitas middleware)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_role TEXT
    CHECK (admin_role IS NULL OR admin_role IN ('SUPER_ADMIN', 'PROVINCE_ADMIN', 'CITY_ADMIN')),
  ADD COLUMN IF NOT EXISTS province_id INTEGER REFERENCES public.provinces(id),
  ADD COLUMN IF NOT EXISTS city_id INTEGER REFERENCES public.cities(id);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS province_id INTEGER REFERENCES public.provinces(id),
  ADD COLUMN IF NOT EXISTS city_id INTEGER REFERENCES public.cities(id);

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS province_id INTEGER REFERENCES public.provinces(id),
  ADD COLUMN IF NOT EXISTS city_id INTEGER REFERENCES public.cities(id);

ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS province_id INTEGER REFERENCES public.provinces(id),
  ADD COLUMN IF NOT EXISTS city_id INTEGER REFERENCES public.cities(id);

ALTER TABLE public.service_cities
  ADD COLUMN IF NOT EXISTS province_id INTEGER REFERENCES public.provinces(id),
  ADD COLUMN IF NOT EXISTS city_id INTEGER REFERENCES public.cities(id);

CREATE INDEX IF NOT EXISTS orders_province_city_idx ON public.orders (province_id, city_id);
CREATE INDEX IF NOT EXISTS drivers_province_city_idx ON public.drivers (province_id, city_id);
CREATE INDEX IF NOT EXISTS merchants_province_city_idx ON public.merchants (province_id, city_id);

-- Backfill wilayah operasional existing (Parung → Bogor)
UPDATE public.service_cities
SET province_id = 31, city_id = 3271
WHERE slug = 'parung-bogor' AND province_id IS NULL;

UPDATE public.drivers d
SET province_id = sc.province_id, city_id = sc.city_id
FROM public.service_cities sc
WHERE d.service_city_id = sc.id AND d.province_id IS NULL;

UPDATE public.merchants m
SET province_id = sc.province_id, city_id = sc.city_id
FROM public.service_cities sc
WHERE m.service_city_id = sc.id AND m.province_id IS NULL;

UPDATE public.orders o
SET province_id = sc.province_id, city_id = sc.city_id
FROM public.service_cities sc
WHERE o.service_city_id = sc.id AND o.province_id IS NULL;

UPDATE public.profiles
SET admin_role = 'SUPER_ADMIN'
WHERE role = 'admin' AND admin_role IS NULL;

-- Tarif regional per provinsi/kota
CREATE TABLE IF NOT EXISTS public.regional_tariffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  province_id INTEGER NOT NULL REFERENCES public.provinces(id) ON DELETE RESTRICT,
  city_id INTEGER REFERENCES public.cities(id) ON DELETE RESTRICT,
  base_fare NUMERIC(12, 2) NOT NULL DEFAULT 5000 CHECK (base_fare >= 0),
  price_per_km NUMERIC(12, 2) NOT NULL DEFAULT 2000 CHECK (price_per_km >= 0),
  merchant_markup NUMERIC(12, 2) NOT NULL DEFAULT 1000 CHECK (merchant_markup >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (province_id, city_id)
);

INSERT INTO public.regional_tariffs (province_id, city_id, base_fare, price_per_km, merchant_markup)
VALUES
  (31, 3271, 5000, 2000, 1000),
  (32, 3578, 6000, 2500, 1000),
  (32, NULL, 5500, 2200, 1000)
ON CONFLICT (province_id, city_id) DO NOTHING;

-- Audit trail admin sensitif
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  admin_role TEXT,
  action TEXT NOT NULL,
  entity_table TEXT,
  entity_id TEXT,
  province_id INTEGER,
  city_id INTEGER,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_audit_logs_created_idx
  ON public.admin_audit_logs (created_at DESC);

ALTER TABLE public.regional_tariffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

/**
 * Baca metadata admin dari JWT Supabase (app_metadata / user_metadata)
 * dengan fallback ke tabel profiles — sumber kebenaran server-side.
 */
CREATE OR REPLACE FUNCTION public.get_auth_admin_metadata()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_jwt JSONB := auth.jwt();
  v_role TEXT;
  v_province INTEGER;
  v_city INTEGER;
BEGIN
  IF v_jwt IS NOT NULL THEN
    v_role := COALESCE(
      v_jwt -> 'app_metadata' ->> 'admin_role',
      v_jwt -> 'user_metadata' ->> 'admin_role'
    );
    BEGIN
      v_province := COALESCE(
        NULLIF(v_jwt -> 'app_metadata' ->> 'province_id', '')::INTEGER,
        NULLIF(v_jwt -> 'user_metadata' ->> 'province_id', '')::INTEGER
      );
    EXCEPTION WHEN OTHERS THEN
      v_province := NULL;
    END;
    BEGIN
      v_city := COALESCE(
        NULLIF(v_jwt -> 'app_metadata' ->> 'city_id', '')::INTEGER,
        NULLIF(v_jwt -> 'user_metadata' ->> 'city_id', '')::INTEGER
      );
    EXCEPTION WHEN OTHERS THEN
      v_city := NULL;
    END;
  END IF;

  IF v_role IS NULL AND v_uid IS NOT NULL THEN
    SELECT p.admin_role, p.province_id, p.city_id
    INTO v_role, v_province, v_city
    FROM public.profiles p
    WHERE p.id = v_uid AND p.role = 'admin';
  END IF;

  RETURN jsonb_build_object(
    'admin_role', v_role,
    'province_id', v_province,
    'city_id', v_city,
    'is_admin', v_role IS NOT NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_scope_allows_order(p_order public.orders)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE (public.get_auth_admin_metadata() ->> 'admin_role')
    WHEN 'SUPER_ADMIN' THEN TRUE
    WHEN 'PROVINCE_ADMIN' THEN
      p_order.province_id IS NOT NULL
      AND p_order.province_id = (public.get_auth_admin_metadata() ->> 'province_id')::INTEGER
    WHEN 'CITY_ADMIN' THEN
      p_order.city_id IS NOT NULL
      AND p_order.city_id = (public.get_auth_admin_metadata() ->> 'city_id')::INTEGER
    ELSE TRUE
  END;
$$;

CREATE OR REPLACE FUNCTION public.admin_scope_allows_tariff(
  p_province_id INTEGER,
  p_city_id INTEGER
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE (public.get_auth_admin_metadata() ->> 'admin_role')
    WHEN 'SUPER_ADMIN' THEN TRUE
    WHEN 'PROVINCE_ADMIN' THEN
      p_province_id = (public.get_auth_admin_metadata() ->> 'province_id')::INTEGER
    WHEN 'CITY_ADMIN' THEN
      p_city_id IS NOT NULL
      AND p_city_id = (public.get_auth_admin_metadata() ->> 'city_id')::INTEGER
    ELSE FALSE
  END;
$$;

-- RESTRICTIVE: filter regional pada orders (AND dengan policy permissive existing)
CREATE POLICY orders_regional_scope_restrict
  ON public.orders
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (public.admin_scope_allows_order(orders.*));

-- regional_tariffs: baca sesuai wilayah; tulis hanya SUPER/PROVINCE
CREATE POLICY regional_tariffs_select_scope
  ON public.regional_tariffs
  FOR SELECT
  TO authenticated
  USING (public.admin_scope_allows_tariff(province_id, city_id));

CREATE POLICY regional_tariffs_write_super_province
  ON public.regional_tariffs
  FOR ALL
  TO authenticated
  USING (
    (public.get_auth_admin_metadata() ->> 'admin_role') IN ('SUPER_ADMIN', 'PROVINCE_ADMIN')
    AND public.admin_scope_allows_tariff(province_id, city_id)
  )
  WITH CHECK (
    (public.get_auth_admin_metadata() ->> 'admin_role') IN ('SUPER_ADMIN', 'PROVINCE_ADMIN')
    AND public.admin_scope_allows_tariff(province_id, city_id)
  );

-- CITY_ADMIN tidak punya policy INSERT/UPDATE → ditolak RLS

CREATE POLICY admin_audit_logs_super_read
  ON public.admin_audit_logs
  FOR SELECT
  TO authenticated
  USING ((public.get_auth_admin_metadata() ->> 'admin_role') = 'SUPER_ADMIN');

GRANT EXECUTE ON FUNCTION public.get_auth_admin_metadata TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_scope_allows_order TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_scope_allows_tariff TO authenticated, service_role;
