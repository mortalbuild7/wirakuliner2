-- Token aktivasi admin — hash SHA-256 disimpan, raw token hanya dikirim via email (anti-leak DB).
CREATE TABLE IF NOT EXISTS public.admin_activation_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_activation_tokens_hash_active_idx
  ON public.admin_activation_tokens (token_hash)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS admin_activation_tokens_user_idx
  ON public.admin_activation_tokens (user_id, created_at DESC);

ALTER TABLE public.admin_activation_tokens ENABLE ROW LEVEL SECURITY;

-- Tanpa kebijakan SELECT/INSERT untuk role anon/authenticated — hanya service role (Server Action).
COMMENT ON TABLE public.admin_activation_tokens IS
  'Token sekali pakai aktivasi admin; raw token tidak pernah disimpan — hanya SHA-256 hash.';
