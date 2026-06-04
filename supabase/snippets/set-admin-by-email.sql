-- Jalankan di Supabase → SQL Editor (ganti email Anda)
-- https://supabase.com/dashboard/project/voswtzwrsjmgeqmyboix/sql/new

UPDATE public.profiles
SET role = 'admin'
WHERE email = 'GANTI_EMAIL_ANDA@example.com';

-- Jika 0 rows updated, buat profile dari auth.users:
INSERT INTO public.profiles (id, email, name, role)
SELECT id, email, COALESCE(raw_user_meta_data->>'name', split_part(email, '@', 1)), 'admin'
FROM auth.users
WHERE email = 'GANTI_EMAIL_ANDA@example.com'
ON CONFLICT (id) DO UPDATE SET role = 'admin';
