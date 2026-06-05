-- Alur order: ready_for_pickup + reward poin driver (100/order)

ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'ready_for_pickup';

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS reward_points INTEGER NOT NULL DEFAULT 0 CHECK (reward_points >= 0);

CREATE TABLE IF NOT EXISTS public.driver_point_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  points INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT 'delivery_complete',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_point_tx_driver ON public.driver_point_transactions(driver_id);

ALTER TABLE public.driver_point_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "driver_points_select_own_or_admin"
  ON public.driver_point_transactions FOR SELECT
  USING (
    driver_id IN (SELECT d.id FROM public.drivers d WHERE d.profile_id = auth.uid())
    OR public.is_admin()
  );

COMMENT ON COLUMN public.drivers.reward_points IS 'Poin reward driver — +100 per pengantaran selesai';
