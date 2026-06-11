-- ============================================================================
-- MIGRATION 038 — Validasi SIM wajib + pelacakan masa berlaku + notifikasi
-- otomatis masa tenggang SIM untuk armada driver.
--
-- Komponen:
--   1. Kolom legalitas SIM pada tabel drivers.
--   2. Fungsi driver_sim_status() — satu sumber kebenaran status SIM
--      (ACTIVE / EXPIRING_SOON / EXPIRED / MISSING).
--   3. Tabel driver_sim_notices — log notifikasi masa tenggang (idempotent).
--   4. Fungsi sweep_driver_sim_notices() — sapuan harian yang menerbitkan
--      notifikasi H-30 (masa tenggang) dan saat SIM kedaluwarsa.
--   5. Penjadwalan otomatis via pg_cron (jika ekstensi tersedia).
--   6. Storage bucket 'driver-documents' untuk foto fisik SIM.
-- ============================================================================

-- ── 1. KOLOM LEGALITAS SIM ──────────────────────────────────────────────────
-- sim_number       : nomor SIM (digit saja, divalidasi zod di Server Action).
-- sim_expiry_date  : tanggal habis berlaku — dasar perhitungan status.
-- sim_document_url : Public URL foto fisik SIM di bucket driver-documents.
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS sim_number TEXT,
  ADD COLUMN IF NOT EXISTS sim_expiry_date DATE,
  ADD COLUMN IF NOT EXISTS sim_document_url TEXT;

-- Index untuk sapuan harian: hanya scan driver yang punya tanggal berlaku.
CREATE INDEX IF NOT EXISTS idx_drivers_sim_expiry
  ON public.drivers (sim_expiry_date)
  WHERE sim_expiry_date IS NOT NULL;

-- ── 2. STATUS SIM TERPUSAT ──────────────────────────────────────────────────
-- Aturan bisnis (masa tenggang 30 hari):
--   NULL                     → 'MISSING'        (belum diunggah / data lama)
--   < hari ini               → 'EXPIRED'        (dilarang menerima order)
--   ≤ hari ini + 30 hari     → 'EXPIRING_SOON'  (masa tenggang — wajib peringatan)
--   selain itu               → 'ACTIVE'
CREATE OR REPLACE FUNCTION public.driver_sim_status(p_expiry DATE)
RETURNS TEXT
LANGUAGE sql
STABLE
AS $fn$
  SELECT CASE
    WHEN p_expiry IS NULL THEN 'MISSING'
    WHEN p_expiry < CURRENT_DATE THEN 'EXPIRED'
    WHEN p_expiry <= CURRENT_DATE + INTERVAL '30 days' THEN 'EXPIRING_SOON'
    ELSE 'ACTIVE'
  END;
$fn$;

-- ── 3. LOG NOTIFIKASI MASA TENGGANG ─────────────────────────────────────────
-- UNIQUE (driver_id, notice_type, sim_expiry_date) → idempotent: satu driver
-- hanya menerima SATU notifikasi per jenis per masa berlaku SIM. Jika SIM
-- diperpanjang (tanggal berubah), siklus notifikasi dimulai ulang otomatis.
CREATE TABLE IF NOT EXISTS public.driver_sim_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.drivers (id) ON DELETE CASCADE,
  notice_type TEXT NOT NULL CHECK (notice_type IN ('SIM_EXPIRING_SOON', 'SIM_EXPIRED')),
  sim_expiry_date DATE NOT NULL,
  message TEXT NOT NULL,
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE,  -- ditandai admin saat ditindaklanjuti
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (driver_id, notice_type, sim_expiry_date)
);

-- RLS: hanya backend (service role) yang menulis; admin membaca via server.
ALTER TABLE public.driver_sim_notices ENABLE ROW LEVEL SECURITY;

-- ── 4. SAPUAN NOTIFIKASI OTOMATIS ───────────────────────────────────────────
-- Dipanggil terjadwal (pg_cron) atau manual oleh backend. SECURITY DEFINER
-- agar bisa berjalan tanpa sesi user. ON CONFLICT DO NOTHING menjamin tidak
-- ada notifikasi ganda walau dipanggil berkali-kali dalam sehari.
CREATE OR REPLACE FUNCTION public.sweep_driver_sim_notices()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_inserted INTEGER := 0;
BEGIN
  -- Notifikasi MASA TENGGANG: SIM habis dalam ≤ 30 hari (tapi belum lewat).
  WITH ins AS (
    INSERT INTO public.driver_sim_notices (driver_id, notice_type, sim_expiry_date, message)
    SELECT
      d.id,
      'SIM_EXPIRING_SOON',
      d.sim_expiry_date,
      'SIM driver ' || d.name || ' habis berlaku ' ||
        TO_CHAR(d.sim_expiry_date, 'DD Mon YYYY') ||
        ' (sisa ' || (d.sim_expiry_date - CURRENT_DATE) || ' hari). Segera perpanjang.'
    FROM public.drivers d
    WHERE d.sim_expiry_date IS NOT NULL
      AND public.driver_sim_status(d.sim_expiry_date) = 'EXPIRING_SOON'
    ON CONFLICT (driver_id, notice_type, sim_expiry_date) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_inserted FROM ins;

  -- Notifikasi KEDALUWARSA: SIM sudah lewat masa berlaku.
  WITH ins AS (
    INSERT INTO public.driver_sim_notices (driver_id, notice_type, sim_expiry_date, message)
    SELECT
      d.id,
      'SIM_EXPIRED',
      d.sim_expiry_date,
      'SIM driver ' || d.name || ' KEDALUWARSA sejak ' ||
        TO_CHAR(d.sim_expiry_date, 'DD Mon YYYY') ||
        '. Driver tidak sah beroperasi sampai SIM diperbarui.'
    FROM public.drivers d
    WHERE d.sim_expiry_date IS NOT NULL
      AND public.driver_sim_status(d.sim_expiry_date) = 'EXPIRED'
    ON CONFLICT (driver_id, notice_type, sim_expiry_date) DO NOTHING
    RETURNING 1
  )
  SELECT v_inserted + COUNT(*) INTO v_inserted FROM ins;

  RETURN v_inserted;  -- jumlah notifikasi baru yang diterbitkan hari ini
END;
$fn$;

-- Hanya backend resmi yang boleh menjalankan sapuan.
REVOKE ALL ON FUNCTION public.sweep_driver_sim_notices() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sweep_driver_sim_notices() TO service_role;

-- ── 5. PENJADWALAN HARIAN VIA pg_cron (best-effort) ─────────────────────────
-- Berjalan tiap hari pukul 01.00 UTC (08.00 WIB). Jika ekstensi pg_cron belum
-- diaktifkan di instance, blok ini lewat tanpa menggagalkan migrasi —
-- sapuan tetap bisa dipanggil manual via RPC oleh backend.
DO $do$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule(
    'sweep-driver-sim-notices',
    '0 1 * * *',
    $cron$ SELECT public.sweep_driver_sim_notices(); $cron$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron tidak tersedia — jadwalkan sweep_driver_sim_notices() manual.';
END;
$do$;

-- ── 6. STORAGE BUCKET DOKUMEN DRIVER ────────────────────────────────────────
-- Public read agar admin/verifikator bisa membuka foto SIM via Public URL;
-- upload dibatasi ke user terotentikasi (form admin) — pola sama dengan
-- bucket driver-avatars (migration 016).
INSERT INTO storage.buckets (id, name, public)
VALUES ('driver-documents', 'driver-documents', true)
ON CONFLICT (id) DO NOTHING;

DO $pol$
BEGIN
  CREATE POLICY "driver_documents_public_read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'driver-documents');
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$pol$;

DO $pol$
BEGIN
  CREATE POLICY "driver_documents_admin_upload"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'driver-documents' AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$pol$;

DO $pol$
BEGIN
  CREATE POLICY "driver_documents_admin_update"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'driver-documents' AND auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$pol$;
