-- Nege luar radius: driver idle bisa lihat order negotiating + order items

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
    OR EXISTS (
      SELECT 1 FROM public.negotiations n
      JOIN public.drivers d ON d.id = n.driver_id
      WHERE n.order_id = orders.id AND d.profile_id = auth.uid()
    )
    OR (
      driver_id IS NULL
      AND negotiation_status = 'negotiating'
      AND is_outside_radius = TRUE
      AND order_status = 'pending_payment'
      AND delivery_address NOT LIKE '[DI TEMPAT]%'
      AND delivery_address NOT LIKE '[POS]%'
      AND EXISTS (
        SELECT 1 FROM public.drivers d
        WHERE d.profile_id = auth.uid() AND d.status IN ('idle', 'delivering')
      )
    )
    OR (
      driver_id IS NULL
      AND order_status IN ('paid', 'preparing', 'ready_for_pickup')
      AND delivery_address NOT LIKE '[DI TEMPAT]%'
      AND delivery_address NOT LIKE '[POS]%'
      AND EXISTS (
        SELECT 1 FROM public.drivers d
        WHERE d.profile_id = auth.uid() AND d.status IN ('idle', 'delivering')
      )
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
        OR EXISTS (
          SELECT 1 FROM public.negotiations n
          JOIN public.drivers d ON d.id = n.driver_id
          WHERE n.order_id = o.id AND d.profile_id = auth.uid()
        )
        OR (
          o.driver_id IS NULL
          AND o.negotiation_status = 'negotiating'
          AND o.is_outside_radius = TRUE
          AND o.order_status = 'pending_payment'
          AND EXISTS (
            SELECT 1 FROM public.drivers d
            WHERE d.profile_id = auth.uid() AND d.status IN ('idle', 'delivering')
          )
        )
        OR (
          o.driver_id IS NULL
          AND o.order_status IN ('paid', 'preparing', 'ready_for_pickup')
          AND o.delivery_address NOT LIKE '[DI TEMPAT]%'
          AND o.delivery_address NOT LIKE '[POS]%'
          AND EXISTS (
            SELECT 1 FROM public.drivers d
            WHERE d.profile_id = auth.uid() AND d.status IN ('idle', 'delivering')
          )
        )
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
    OR EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.drivers d ON d.profile_id = auth.uid()
      WHERE o.id = order_id
        AND o.negotiation_status = 'negotiating'
        AND o.is_outside_radius = TRUE
        AND d.status IN ('idle', 'delivering')
    )
    OR public.is_admin()
  );
