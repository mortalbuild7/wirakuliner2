-- Admin: batalkan order + catatan refund penuh

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS admin_cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS admin_cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_cancelled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS refund_status TEXT,
  ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(12, 2);

COMMENT ON COLUMN public.orders.refund_status IS 'none | full_refund | pending_midtrans';
