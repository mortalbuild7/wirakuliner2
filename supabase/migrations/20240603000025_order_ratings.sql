-- Rating customer terhadap driver & merchant per pesanan selesai

CREATE TYPE public.rating_target_type AS ENUM ('driver', 'merchant');

CREATE TABLE IF NOT EXISTS public.order_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type public.rating_target_type NOT NULL,
  target_id UUID NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, target_type)
);

CREATE INDEX IF NOT EXISTS order_ratings_target_idx
  ON public.order_ratings (target_type, target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS order_ratings_customer_idx
  ON public.order_ratings (customer_id, created_at DESC);

COMMENT ON TABLE public.order_ratings IS 'Ulasan customer untuk driver atau merchant setelah pesanan delivered';

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS rating_avg NUMERIC(3, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS rating_avg NUMERIC(3, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_count INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.refresh_rating_aggregate(
  p_target_type public.rating_target_type,
  p_target_id UUID
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_avg NUMERIC(3, 2);
  v_count INTEGER;
BEGIN
  SELECT
    COALESCE(ROUND(AVG(rating)::numeric, 2), 0),
    COUNT(*)::integer
  INTO v_avg, v_count
  FROM public.order_ratings
  WHERE target_type = p_target_type AND target_id = p_target_id;

  IF p_target_type = 'driver' THEN
    UPDATE public.drivers
    SET rating_avg = v_avg, rating_count = v_count, updated_at = NOW()
    WHERE id = p_target_id;
  ELSE
    UPDATE public.merchants
    SET rating_avg = v_avg, rating_count = v_count, updated_at = NOW()
    WHERE id = p_target_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.order_ratings_aggregate_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_rating_aggregate(OLD.target_type, OLD.target_id);
    RETURN OLD;
  END IF;

  PERFORM public.refresh_rating_aggregate(NEW.target_type, NEW.target_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_ratings_aggregate_trg ON public.order_ratings;
CREATE TRIGGER order_ratings_aggregate_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.order_ratings
  FOR EACH ROW
  EXECUTE FUNCTION public.order_ratings_aggregate_trigger();

ALTER TABLE public.order_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_ratings_select_participants"
  ON public.order_ratings FOR SELECT
  TO authenticated
  USING (
    customer_id = auth.uid()
    OR (
      target_type = 'driver'
      AND target_id IN (
        SELECT d.id FROM public.drivers d WHERE d.profile_id = auth.uid()
      )
    )
    OR (
      target_type = 'merchant'
      AND target_id IN (
        SELECT m.id FROM public.merchants m WHERE m.owner_id = auth.uid()
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "order_ratings_insert_customer"
  ON public.order_ratings FOR INSERT
  TO authenticated
  WITH CHECK (customer_id = auth.uid());
