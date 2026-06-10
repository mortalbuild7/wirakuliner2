-- =============================================================================
-- UU PDP — Pelindungan Data Pribadi Customer (RLS profiles)
-- =============================================================================
-- Prinsip:
-- 1. Customer hanya SELECT/UPDATE baris sendiri (auth.uid() = id)
-- 2. Admin regional hanya SELECT customer dalam wilayah tugas (geo-authorization)
-- 3. SUPER_ADMIN boleh SELECT semua profil (operasional nasional)
-- =============================================================================

-- Backfill wilayah customer dari order terakhir (untuk geo-admin authorization)
UPDATE public.profiles p
SET
  province_id = o.province_id,
  city_id = o.city_id
FROM (
  SELECT DISTINCT ON (customer_id)
    customer_id,
    province_id,
    city_id
  FROM public.orders
  WHERE province_id IS NOT NULL
  ORDER BY customer_id, created_at DESC
) o
WHERE p.id = o.customer_id
  AND p.role = 'customer'
  AND p.city_id IS NULL;

CREATE OR REPLACE FUNCTION public.admin_scope_allows_customer_profile(
  p_profile_role public.user_role,
  p_profile_province_id INTEGER,
  p_profile_city_id INTEGER
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
      p_profile_role = 'customer'::public.user_role
      AND p_profile_province_id IS NOT NULL
      AND p_profile_province_id = NULLIF(public.get_auth_admin_metadata() ->> 'province_id', '')::INTEGER
    WHEN 'CITY_ADMIN' THEN
      p_profile_role = 'customer'::public.user_role
      AND p_profile_city_id IS NOT NULL
      AND p_profile_city_id = NULLIF(public.get_auth_admin_metadata() ->> 'city_id', '')::INTEGER
    ELSE FALSE
  END;
$$;

COMMENT ON FUNCTION public.admin_scope_allows_customer_profile IS
  'Multi-tenant geo-authorization: admin regional hanya baca profil customer di wilayah tugas.';

CREATE OR REPLACE FUNCTION public.admin_can_read_profile_row(
  p_role public.user_role,
  p_province_id INTEGER,
  p_city_id INTEGER
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((public.get_auth_admin_metadata() ->> 'is_admin')::BOOLEAN, FALSE) IS TRUE
    AND public.admin_scope_allows_customer_profile(p_role, p_province_id, p_city_id);
$$;

-- Ganti policy SELECT lama (is_admin() terlalu luas — risiko harvesting lintas wilayah)
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_own_or_geo_admin"
  ON public.profiles
  FOR SELECT
  USING (
    auth.uid() = id
    OR public.admin_can_read_profile_row(
      (profiles.role)::public.user_role,
      profiles.province_id,
      profiles.city_id
    )
  );

-- UPDATE: customer hanya boleh mengubah profil sendiri (UU PDP — hak akses & koreksi data)
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own_strict"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

COMMENT ON POLICY "profiles_select_own_or_geo_admin" ON public.profiles IS
  'Customer: data sendiri saja. Admin: geo-scoped SELECT customer (SUPER/PROVINCE/CITY).';

COMMENT ON POLICY "profiles_update_own_strict" ON public.profiles IS
  'Customer hanya UPDATE baris miliknya; perubahan role diblok trigger guard_profile_role.';
