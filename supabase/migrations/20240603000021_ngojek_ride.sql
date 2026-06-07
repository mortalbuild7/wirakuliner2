-- NGOJEK: ojek/ride — titik jemput terpisah dari tujuan
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pickup_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS pickup_lng DOUBLE PRECISION;

-- Item ride tanpa produk toko (hanya tarif perjalanan)
ALTER TABLE public.order_items
  ALTER COLUMN product_id DROP NOT NULL;
