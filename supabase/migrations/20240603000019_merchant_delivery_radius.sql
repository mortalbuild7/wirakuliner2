-- Radius 3 km dihitung dari koordinat toko (merchant), bukan pusat Jalan Wira.

CREATE OR REPLACE FUNCTION public.haversine_km(
  lat1 DOUBLE PRECISION,
  lng1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION,
  lng2 DOUBLE PRECISION
)
RETURNS DOUBLE PRECISION
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 6371.0 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

CREATE OR REPLACE FUNCTION public.distance_from_merchant(
  p_merchant_id UUID,
  delivery_lat DOUBLE PRECISION,
  delivery_lng DOUBLE PRECISION
)
RETURNS DOUBLE PRECISION
LANGUAGE sql
STABLE
AS $$
  SELECT public.haversine_km(m.latitude, m.longitude, delivery_lat, delivery_lng)
  FROM public.merchants m
  WHERE m.id = p_merchant_id;
$$;

CREATE OR REPLACE FUNCTION public.is_within_merchant_delivery_radius(
  p_merchant_id UUID,
  delivery_lat DOUBLE PRECISION,
  delivery_lng DOUBLE PRECISION,
  radius_km DOUBLE PRECISION DEFAULT 3.0
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    public.distance_from_merchant(p_merchant_id, delivery_lat, delivery_lng) <= radius_km,
    FALSE
  );
$$;

COMMENT ON FUNCTION public.distance_from_merchant IS
  'Jarak km dari lokasi toko (merchant lat/lng) ke titik antar customer.';

COMMENT ON FUNCTION public.is_within_merchant_delivery_radius IS
  'Apakah titik antar berada dalam radius (default 3 km) dari toko yang dipesan.';
