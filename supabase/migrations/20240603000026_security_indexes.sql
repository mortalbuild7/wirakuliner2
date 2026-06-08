-- Indeks untuk mitigasi query lambat / inefficient query attack pada pencarian & join.
-- WAJIB: kolom foreign key dan filter WHERE/ORDER BY yang sering dipakai harus terindeks.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Pencarian nama restoran (catalog search, etalase)
CREATE INDEX IF NOT EXISTS merchants_name_trgm_idx
  ON public.merchants USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS merchants_list_filter_idx
  ON public.merchants (is_active, admin_suspended, approval_status, category);

COMMENT ON INDEX public.merchants_name_trgm_idx IS
  'Percepat ILIKE/ search nama restoran — wajib untuk endpoint /api/catalog/search';

-- Pencarian nama menu
CREATE INDEX IF NOT EXISTS products_name_trgm_idx
  ON public.products USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS products_merchant_available_idx
  ON public.products (merchant_id, is_available);

COMMENT ON INDEX public.products_name_trgm_idx IS
  'Percepat pencarian menu by name — hindari full table scan saat pagination';

-- Wallet: row lock via owner_type + owner_id (race condition withdraw simultan)
CREATE INDEX IF NOT EXISTS wallets_owner_unique_lookup_idx
  ON public.wallets (owner_type, owner_id);

COMMENT ON INDEX public.wallets_owner_unique_lookup_idx IS
  'FOR UPDATE di wallet_apply_tx — pastikan lookup wallet O(1) bukan seq scan';

-- Orders: filter customer / driver / status (tracking, rating)
CREATE INDEX IF NOT EXISTS orders_customer_status_idx
  ON public.orders (customer_id, order_status, created_at DESC);

CREATE INDEX IF NOT EXISTS orders_driver_status_idx
  ON public.orders (driver_id, order_status, created_at DESC)
  WHERE driver_id IS NOT NULL;
