-- Customer etalase: status buka/tutup tanpa refresh (Supabase Realtime)
ALTER PUBLICATION supabase_realtime ADD TABLE public.merchants;

-- Pastikan payload UPDATE lengkap (kolom is_open ikut terkirim)
ALTER TABLE public.merchants REPLICA IDENTITY FULL;
