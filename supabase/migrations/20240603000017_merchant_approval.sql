-- Persetujuan admin untuk pendaftaran merchant mandiri
ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_note TEXT;

UPDATE public.merchants
SET approval_status = 'approved',
    approved_at = COALESCE(approved_at, created_at)
WHERE approval_status IS NULL OR approval_status = 'approved';

CREATE INDEX IF NOT EXISTS idx_merchants_approval_status ON public.merchants (approval_status);
