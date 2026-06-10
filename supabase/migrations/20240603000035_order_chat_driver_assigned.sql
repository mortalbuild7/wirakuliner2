-- Chat aktif sejak driver ditugaskan (paid/preparing), tidak hanya saat jemput/antar.

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
      AND o.order_status IN ('paid', 'preparing', 'ready_for_pickup', 'on_the_way')
  );
$$;

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

  IF v_driver_id IS NULL OR v_status NOT IN ('paid', 'preparing', 'ready_for_pickup', 'on_the_way') THEN
    RAISE EXCEPTION 'Chat belum aktif untuk pesanan ini';
  END IF;

  RETURN NEW;
END;
$$;
