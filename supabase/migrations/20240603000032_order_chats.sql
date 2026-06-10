-- =============================================================================
-- CHAT REAL-TIME CUSTOMER ↔ DRIVER (per order_id, stateless via Supabase Realtime)
-- =============================================================================
-- Status bisnis (mapping ke order_status existing):
--   PICKING_UP  → ready_for_pickup  (driver sudah ditugaskan, menuju jemput)
--   DELIVERING  → on_the_way        (perjalanan aktif)
--   COMPLETED   → delivered         (chat ditutup)
--   CANCELLED   → cancelled         (chat ditutup)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.order_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL CHECK (char_length(trim(message)) > 0 AND char_length(message) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_chats_order_created_idx
  ON public.order_chats (order_id, created_at);

-- ---------------------------------------------------------------------------
-- Helper: apakah user adalah customer atau driver pada order tersebut
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_is_order_chat_participant(
  p_order_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = p_order_id
      AND (
        o.customer_id = p_user_id
        OR o.driver_id IN (
          SELECT d.id FROM public.drivers d WHERE d.profile_id = p_user_id
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Helper: chat hanya terbuka saat driver sudah ditugaskan & perjalanan aktif
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.order_chat_is_open(p_order_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = p_order_id
      AND o.driver_id IS NOT NULL
      AND o.order_status IN ('ready_for_pickup', 'on_the_way')
  );
$$;

-- ---------------------------------------------------------------------------
-- Trigger: tolak INSERT jika order sudah selesai / dibatalkan / belum aktif
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_order_chat_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_driver_id UUID;
BEGIN
  SELECT o.order_status, o.driver_id
  INTO v_status, v_driver_id
  FROM public.orders o
  WHERE o.id = NEW.order_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Pesanan tidak ditemukan';
  END IF;

  IF v_status IN ('delivered', 'cancelled') THEN
    RAISE EXCEPTION 'Pesanan telah selesai, chat dinonaktifkan';
  END IF;

  IF v_driver_id IS NULL OR v_status NOT IN ('ready_for_pickup', 'on_the_way') THEN
    RAISE EXCEPTION 'Chat belum aktif untuk pesanan ini';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_order_chat_insert ON public.order_chats;
CREATE TRIGGER trg_enforce_order_chat_insert
  BEFORE INSERT ON public.order_chats
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_order_chat_insert();

-- ---------------------------------------------------------------------------
-- RLS — hanya customer & driver pada order yang sama
-- ---------------------------------------------------------------------------
ALTER TABLE public.order_chats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "order_chats_select_participants" ON public.order_chats;
CREATE POLICY "order_chats_select_participants"
  ON public.order_chats
  FOR SELECT
  USING (public.user_is_order_chat_participant(order_id, auth.uid()));

DROP POLICY IF EXISTS "order_chats_insert_participants" ON public.order_chats;
CREATE POLICY "order_chats_insert_participants"
  ON public.order_chats
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND public.user_is_order_chat_participant(order_id, auth.uid())
    AND public.order_chat_is_open(order_id)
  );

-- Tidak ada policy UPDATE/DELETE → ditolak default (immutable chat log)

-- Realtime: subscribe per order_id
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_chats;
