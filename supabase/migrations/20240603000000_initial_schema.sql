-- WIRA Kuliner — initial schema, RLS, geospatial helpers, Realtime
-- Apply via: supabase db push (or supabase migration up)

-- UUID generation (Supabase: use gen_random_uuid from pgcrypto)
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- Enums
CREATE TYPE user_role AS ENUM ('admin', 'merchant', 'customer', 'driver');
CREATE TYPE driver_status AS ENUM ('idle', 'delivering', 'offline');
CREATE TYPE negotiation_status AS ENUM ('none', 'negotiating', 'agreed');
CREATE TYPE order_status AS ENUM (
  'pending_payment',
  'paid',
  'preparing',
  'on_the_way',
  'delivered',
  'cancelled'
);
CREATE TYPE negotiation_record_status AS ENUM ('pending', 'accepted', 'rejected');

-- Profiles (extends auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  email TEXT,
  role user_role NOT NULL DEFAULT 'customer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  address TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  image_url TEXT,
  category TEXT DEFAULT 'umum',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
  image_url TEXT,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.drivers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  vehicle_plate TEXT,
  status driver_status NOT NULL DEFAULT 'offline',
  current_lat DOUBLE PRECISION,
  current_lng DOUBLE PRECISION,
  fcm_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE RESTRICT,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  total_product_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_product_amount >= 0),
  delivery_fee NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  is_outside_radius BOOLEAN NOT NULL DEFAULT FALSE,
  negotiation_status negotiation_status NOT NULL DEFAULT 'none',
  order_status order_status NOT NULL DEFAULT 'pending_payment',
  delivery_address TEXT NOT NULL,
  delivery_lat DOUBLE PRECISION NOT NULL,
  delivery_lng DOUBLE PRECISION NOT NULL,
  distance_km DOUBLE PRECISION,
  snap_token TEXT,
  payment_gateway TEXT DEFAULT 'midtrans',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
  product_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.negotiations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  proposed_fee NUMERIC(12, 2) NOT NULL CHECK (proposed_fee >= 0),
  status negotiation_record_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, driver_id)
);

CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_merchants_active ON public.merchants(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_products_merchant ON public.products(merchant_id);
CREATE INDEX idx_orders_customer ON public.orders(customer_id);
CREATE INDEX idx_orders_merchant ON public.orders(merchant_id);
CREATE INDEX idx_orders_status ON public.orders(order_status);
CREATE INDEX idx_order_items_order ON public.order_items(order_id);
CREATE INDEX idx_negotiations_order ON public.negotiations(order_id);
CREATE INDEX idx_chat_messages_order ON public.chat_messages(order_id, created_at);
CREATE INDEX idx_drivers_status ON public.drivers(status) WHERE status = 'idle';

-- Reference point: Jalan Wira (config mirror in app — defaults here)
CREATE OR REPLACE FUNCTION public.haversine_km(
  lat1 DOUBLE PRECISION,
  lng1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION,
  lng2 DOUBLE PRECISION
)
RETURNS DOUBLE PRECISION
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT (
    6371 * acos(
      LEAST(1.0, GREATEST(-1.0,
        cos(radians(lat1)) * cos(radians(lat2)) *
        cos(radians(lng2) - radians(lng1)) +
        sin(radians(lat1)) * sin(radians(lat2))
      ))
    )
  );
$$;

-- Jalan Wira reference (update coordinates in migration if needed)
CREATE OR REPLACE FUNCTION public.jalan_wira_lat()
RETURNS DOUBLE PRECISION LANGUAGE SQL IMMUTABLE AS $$ SELECT -5.134800::DOUBLE PRECISION; $$;

CREATE OR REPLACE FUNCTION public.jalan_wira_lng()
RETURNS DOUBLE PRECISION LANGUAGE SQL IMMUTABLE AS $$ SELECT 119.406500::DOUBLE PRECISION; $$;

CREATE OR REPLACE FUNCTION public.distance_from_jalan_wira(
  delivery_lat DOUBLE PRECISION,
  delivery_lng DOUBLE PRECISION
)
RETURNS DOUBLE PRECISION
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT public.haversine_km(
    public.jalan_wira_lat(),
    public.jalan_wira_lng(),
    delivery_lat,
    delivery_lng
  );
$$;

CREATE OR REPLACE FUNCTION public.is_within_delivery_radius(
  delivery_lat DOUBLE PRECISION,
  delivery_lng DOUBLE PRECISION,
  radius_km DOUBLE PRECISION DEFAULT 3.0
)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT public.distance_from_jalan_wira(delivery_lat, delivery_lng) <= radius_km;
$$;

CREATE OR REPLACE FUNCTION public.flat_delivery_fee()
RETURNS NUMERIC
LANGUAGE SQL
IMMUTABLE
AS $$ SELECT 12000::NUMERIC; $$;

-- Auto profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'customer')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER merchants_updated_at BEFORE UPDATE ON public.merchants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER drivers_updated_at BEFORE UPDATE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER negotiations_updated_at BEFORE UPDATE ON public.negotiations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.negotiations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "profiles_select_own_or_admin"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() = id
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Merchants
CREATE POLICY "merchants_select_active_or_owner_admin"
  ON public.merchants FOR SELECT
  USING (
    is_active = TRUE
    OR owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "merchants_insert_owner_admin"
  ON public.merchants FOR INSERT
  WITH CHECK (
    owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "merchants_update_owner_admin"
  ON public.merchants FOR UPDATE
  USING (
    owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Products
CREATE POLICY "products_select_all_authenticated"
  ON public.products FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "products_manage_merchant_owner"
  ON public.products FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.merchants m
      WHERE m.id = merchant_id AND m.owner_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Drivers
CREATE POLICY "drivers_select_authenticated"
  ON public.drivers FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "drivers_admin_all"
  ON public.drivers FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "drivers_update_own_profile"
  ON public.drivers FOR UPDATE
  USING (profile_id = auth.uid());

-- Orders
CREATE POLICY "orders_select_participants"
  ON public.orders FOR SELECT
  USING (
    customer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.merchants m
      WHERE m.id = merchant_id AND m.owner_id = auth.uid()
    )
    OR driver_id IN (SELECT d.id FROM public.drivers d WHERE d.profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "orders_insert_customer"
  ON public.orders FOR INSERT
  WITH CHECK (customer_id = auth.uid());

CREATE POLICY "orders_update_participants"
  ON public.orders FOR UPDATE
  USING (
    customer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.merchants m
      WHERE m.id = merchant_id AND m.owner_id = auth.uid()
    )
    OR driver_id IN (SELECT d.id FROM public.drivers d WHERE d.profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Order items
CREATE POLICY "order_items_select_via_order"
  ON public.order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
      AND (
        o.customer_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.merchants m WHERE m.id = o.merchant_id AND m.owner_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
      )
    )
  );

CREATE POLICY "order_items_insert_customer"
  ON public.order_items FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.customer_id = auth.uid())
  );

-- Negotiations
CREATE POLICY "negotiations_select_participants"
  ON public.negotiations FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.customer_id = auth.uid())
    OR driver_id IN (SELECT d.id FROM public.drivers d WHERE d.profile_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "negotiations_insert_driver"
  ON public.negotiations FOR INSERT
  WITH CHECK (
    driver_id IN (SELECT d.id FROM public.drivers d WHERE d.profile_id = auth.uid())
  );

CREATE POLICY "negotiations_update_participants"
  ON public.negotiations FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.customer_id = auth.uid())
    OR driver_id IN (SELECT d.id FROM public.drivers d WHERE d.profile_id = auth.uid())
  );

-- Chat
CREATE POLICY "chat_select_order_participants"
  ON public.chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
      AND (
        o.customer_id = auth.uid()
        OR o.driver_id IN (SELECT d.id FROM public.drivers d WHERE d.profile_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.merchants m WHERE m.id = o.merchant_id AND m.owner_id = auth.uid())
      )
    )
  );

CREATE POLICY "chat_insert_participants"
  ON public.chat_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
      AND (
        o.customer_id = auth.uid()
        OR o.driver_id IN (SELECT d.id FROM public.drivers d WHERE d.profile_id = auth.uid())
      )
    )
  );

-- Public read for transparency aggregates (merchants count only via view)
CREATE OR REPLACE VIEW public.platform_stats_public AS
SELECT
  COUNT(DISTINCT m.id)::INTEGER AS active_merchants,
  COUNT(DISTINCT o.id) FILTER (WHERE o.order_status = 'delivered')::INTEGER AS completed_orders,
  COALESCE(SUM(o.total_product_amount + o.delivery_fee) FILTER (WHERE o.order_status = 'delivered'), 0)::NUMERIC AS total_gmv
FROM public.merchants m
LEFT JOIN public.orders o ON o.merchant_id = m.id;

GRANT SELECT ON public.platform_stats_public TO anon, authenticated;

-- Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.negotiations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- Storage buckets (run in dashboard or separate migration)
-- menu-images: merchant product uploads
