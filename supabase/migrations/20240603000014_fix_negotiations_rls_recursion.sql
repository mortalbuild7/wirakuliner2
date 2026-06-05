-- Putus rekursi RLS: orders ↔ negotiations (infinite recursion di laporan merchant, dll.)

CREATE OR REPLACE FUNCTION public.order_customer_id(p_order_id UUID)
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT customer_id FROM public.orders WHERE id = p_order_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.order_merchant_owner_id(p_order_id UUID)
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT m.owner_id
  FROM public.orders o
  JOIN public.merchants m ON m.id = o.merchant_id
  WHERE o.id = p_order_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.driver_has_negotiation_on_order(p_order_id UUID, p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.negotiations n
    JOIN public.drivers d ON d.id = n.driver_id
    WHERE n.order_id = p_order_id AND d.profile_id = p_profile_id
  );
$$;

CREATE OR REPLACE FUNCTION public.order_is_nego_pool_for_driver(p_order_id UUID, p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.drivers d ON d.profile_id = p_profile_id
    WHERE o.id = p_order_id
      AND o.negotiation_status = 'negotiating'
      AND o.is_outside_radius = TRUE
      AND d.status IN ('idle', 'delivering')
  );
$$;

CREATE OR REPLACE FUNCTION public.driver_sees_delivery_pool(p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.profile_id = p_profile_id AND d.status IN ('idle', 'delivering')
  );
$$;

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
    OR public.driver_has_negotiation_on_order(id, auth.uid())
    OR (
      driver_id IS NULL
      AND negotiation_status = 'negotiating'
      AND is_outside_radius = TRUE
      AND order_status = 'pending_payment'
      AND delivery_address NOT LIKE '[DI TEMPAT]%'
      AND delivery_address NOT LIKE '[POS]%'
      AND public.driver_sees_delivery_pool(auth.uid())
    )
    OR (
      driver_id IS NULL
      AND order_status IN ('paid', 'preparing', 'ready_for_pickup')
      AND delivery_address NOT LIKE '[DI TEMPAT]%'
      AND delivery_address NOT LIKE '[POS]%'
      AND public.driver_sees_delivery_pool(auth.uid())
    )
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
        OR EXISTS (
          SELECT 1 FROM public.merchants m
          WHERE m.id = o.merchant_id AND m.owner_id = auth.uid()
        )
        OR o.driver_id IN (SELECT d.id FROM public.drivers d WHERE d.profile_id = auth.uid())
        OR public.driver_has_negotiation_on_order(o.id, auth.uid())
        OR (
          o.driver_id IS NULL
          AND o.negotiation_status = 'negotiating'
          AND o.is_outside_radius = TRUE
          AND o.order_status = 'pending_payment'
          AND public.driver_sees_delivery_pool(auth.uid())
        )
        OR (
          o.driver_id IS NULL
          AND o.order_status IN ('paid', 'preparing', 'ready_for_pickup')
          AND o.delivery_address NOT LIKE '[DI TEMPAT]%'
          AND o.delivery_address NOT LIKE '[POS]%'
          AND public.driver_sees_delivery_pool(auth.uid())
        )
        OR public.is_admin()
      )
    )
  );

DROP POLICY IF EXISTS "negotiations_select_participants" ON public.negotiations;
CREATE POLICY "negotiations_select_participants"
  ON public.negotiations FOR SELECT
  USING (
    public.order_customer_id(order_id) = auth.uid()
    OR public.order_merchant_owner_id(order_id) = auth.uid()
    OR driver_id IN (SELECT d.id FROM public.drivers d WHERE d.profile_id = auth.uid())
    OR public.order_is_nego_pool_for_driver(order_id, auth.uid())
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "negotiations_update_participants" ON public.negotiations;
CREATE POLICY "negotiations_update_participants"
  ON public.negotiations FOR UPDATE
  USING (
    public.order_customer_id(order_id) = auth.uid()
    OR driver_id IN (SELECT d.id FROM public.drivers d WHERE d.profile_id = auth.uid())
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "chat_select_order_participants" ON public.chat_messages;
CREATE POLICY "chat_select_order_participants"
  ON public.chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
      AND (
        o.customer_id = auth.uid()
        OR o.driver_id IN (SELECT d.id FROM public.drivers d WHERE d.profile_id = auth.uid())
        OR public.driver_has_negotiation_on_order(o.id, auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.merchants m
          WHERE m.id = o.merchant_id AND m.owner_id = auth.uid()
        )
      )
    )
  );

DROP POLICY IF EXISTS "chat_insert_participants" ON public.chat_messages;
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
        OR public.driver_has_negotiation_on_order(o.id, auth.uid())
      )
    )
  );
