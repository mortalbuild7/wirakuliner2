-- Driver mobile app: RLS extensions, job pool visibility, realtime GPS

-- Orders: driver sees assigned orders, active negotiations, or open delivery jobs (idle)
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
      AND order_status IN ('paid', 'preparing')
      AND delivery_address NOT LIKE '[DI TEMPAT]%'
      AND delivery_address NOT LIKE '[POS]%'
      AND EXISTS (
        SELECT 1 FROM public.drivers d
        WHERE d.profile_id = auth.uid() AND d.status IN ('idle', 'delivering')
      )
    )
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Order items: drivers via assignment or negotiation / job pool
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
          AND o.order_status IN ('paid', 'preparing')
          AND o.delivery_address NOT LIKE '[DI TEMPAT]%'
          AND o.delivery_address NOT LIKE '[POS]%'
          AND EXISTS (
            SELECT 1 FROM public.drivers d
            WHERE d.profile_id = auth.uid() AND d.status IN ('idle', 'delivering')
          )
        )
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
      )
    )
  );

-- Chat: allow drivers during active negotiation (before driver_id assigned)
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
        OR EXISTS (
          SELECT 1 FROM public.negotiations n
          JOIN public.drivers d ON d.id = n.driver_id
          WHERE n.order_id = o.id AND d.profile_id = auth.uid()
        )
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
        OR EXISTS (
          SELECT 1 FROM public.negotiations n
          JOIN public.drivers d ON d.id = n.driver_id
          WHERE n.order_id = o.id AND d.profile_id = auth.uid()
        )
      )
    )
  );

-- Driver self-link on first setup (phone match, profile_id still null)
DROP POLICY IF EXISTS "drivers_update_own_profile" ON public.drivers;
CREATE POLICY "drivers_update_own_profile"
  ON public.drivers FOR UPDATE
  USING (
    profile_id = auth.uid()
    OR (
      profile_id IS NULL
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'driver'
      )
    )
  )
  WITH CHECK (profile_id = auth.uid());

-- Realtime: live driver GPS for customer tracker
ALTER PUBLICATION supabase_realtime ADD TABLE public.drivers;
ALTER TABLE public.drivers REPLICA IDENTITY FULL;
