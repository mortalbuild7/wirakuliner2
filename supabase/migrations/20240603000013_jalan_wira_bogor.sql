-- WIRA Kuliner: Jl. Me. Wira 12, Parung, Bogor (bukan Makassar)

CREATE OR REPLACE FUNCTION public.jalan_wira_lat()
RETURNS DOUBLE PRECISION LANGUAGE SQL IMMUTABLE AS $$ SELECT -6.427760::DOUBLE PRECISION; $$;

CREATE OR REPLACE FUNCTION public.jalan_wira_lng()
RETURNS DOUBLE PRECISION LANGUAGE SQL IMMUTABLE AS $$ SELECT 106.727392::DOUBLE PRECISION; $$;

-- Koreksi toko yang masih pakai placeholder Makassar
UPDATE public.merchants
SET
  latitude = -6.427760,
  longitude = 106.727392,
  address = COALESCE(NULLIF(TRIM(address), ''), 'Jl. Me. Wira 12, Parung, Bogor')
WHERE
  (latitude BETWEEN -5.25 AND -5.10 AND longitude BETWEEN 119.35 AND 119.50)
  OR (latitude = -5.1348 AND longitude = 119.4065)
  OR (latitude = -5.1877 AND longitude = 119.4343);
