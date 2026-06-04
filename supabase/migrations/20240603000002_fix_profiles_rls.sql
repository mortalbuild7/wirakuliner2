-- Fix infinite recursion: admin check must not re-enter profiles RLS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "merchants_select_active_or_owner_admin" ON public.merchants;
CREATE POLICY "merchants_select_active_or_owner_admin"
  ON public.merchants FOR SELECT
  USING (
    is_active = TRUE
    OR owner_id = auth.uid()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "merchants_insert_owner_admin" ON public.merchants;
CREATE POLICY "merchants_insert_owner_admin"
  ON public.merchants FOR INSERT
  WITH CHECK (owner_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "merchants_update_owner_admin" ON public.merchants;
CREATE POLICY "merchants_update_owner_admin"
  ON public.merchants FOR UPDATE
  USING (owner_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "products_manage_merchant_owner" ON public.products;
CREATE POLICY "products_manage_merchant_owner"
  ON public.products FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.merchants m
      WHERE m.id = merchant_id AND m.owner_id = auth.uid()
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "drivers_admin_all" ON public.drivers;
CREATE POLICY "drivers_admin_all"
  ON public.drivers FOR ALL
  USING (public.is_admin());

DROP POLICY IF EXISTS "orders_select_participants" ON public.orders;
CREATE POLICY "orders_select_participants"
  ON public.orders FOR SELECT
  USING (
    customer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.merchants m
      WHERE m.id = merchant_id AND m.owner_id = auth.uid()
    )
    OR driver_id IN (SELECT d.id FROM public.drivers d WHERE d.profile_id = auth.uid())
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "orders_update_participants" ON public.orders;
CREATE POLICY "orders_update_participants"
  ON public.orders FOR UPDATE
  USING (
    customer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.merchants m
      WHERE m.id = merchant_id AND m.owner_id = auth.uid()
    )
    OR driver_id IN (SELECT d.id FROM public.drivers d WHERE d.profile_id = auth.uid())
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "order_items_select_via_order" ON public.order_items;
CREATE POLICY "order_items_select_via_order"
  ON public.order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
      AND (
        o.customer_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.merchants m WHERE m.id = o.merchant_id AND m.owner_id = auth.uid())
        OR public.is_admin()
      )
    )
  );

DROP POLICY IF EXISTS "negotiations_select_participants" ON public.negotiations;
CREATE POLICY "negotiations_select_participants"
  ON public.negotiations FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.customer_id = auth.uid())
    OR driver_id IN (SELECT d.id FROM public.drivers d WHERE d.profile_id = auth.uid())
    OR public.is_admin()
  );
