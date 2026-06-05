-- Foto profil driver (ditampilkan di lacak pesanan customer)
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- Bucket avatar driver (public read, upload via service role / admin API)
INSERT INTO storage.buckets (id, name, public)
VALUES ('driver-avatars', 'driver-avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "driver_avatars_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'driver-avatars');

CREATE POLICY "driver_avatars_admin_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'driver-avatars' AND auth.role() = 'authenticated');

CREATE POLICY "driver_avatars_admin_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'driver-avatars' AND auth.role() = 'authenticated');
