-- Driver job pool: sertakan ready_for_pickup

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
