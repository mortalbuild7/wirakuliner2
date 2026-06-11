-- =============================================================================
-- Pembatalan Darurat Admin (Emergency Cancellation) — satu transaction block.
--
-- Mitigasi risiko finansial ojol:
-- 1. SELECT ... FOR UPDATE pada baris order  → anti race condition: dua admin
--    (atau admin vs driver/webhook pembayaran) tidak bisa memproses order yang
--    sama secara bersamaan; transaksi kedua menunggu lalu gagal di guard status.
-- 2. Seluruh efek (order, driver, KPI, refund wallet) dalam SATU fungsi plpgsql
--    → otomatis satu transaction: gagal di tengah = ROLLBACK semua, tidak ada
--    refund tanpa pembatalan atau pembatalan tanpa refund.
-- 3. SECURITY DEFINER + GRANT hanya ke service_role → klien/anon tidak bisa
--    memanggil langsung; hanya backend (Server Action) yang terautentikasi.
-- 4. Guard yurisdiksi di SQL (defense-in-depth) → walau Server Action diretas /
--    salah kode, CITY_ADMIN tetap tidak bisa membatalkan order kota lain.
-- =============================================================================

-- Nilai enum baru untuk jejak audit refund di buku besar wallet_transactions.
-- (Aman dijalankan ulang; nilai hanya dipakai saat runtime, bukan di migrasi ini.)
ALTER TYPE public.wallet_tx_type ADD VALUE IF NOT EXISTS 'order_refund';

CREATE OR REPLACE FUNCTION public.execute_admin_order_cancellation(
  p_order_id UUID,
  p_admin_id UUID,
  p_reason TEXT,
  -- Lingkup yurisdiksi admin; NULL = tanpa batasan (SUPER_ADMIN).
  p_admin_city_id INTEGER DEFAULT NULL,
  p_admin_province_id INTEGER DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
-- search_path dikunci → anti SQL injection via schema/function shadowing.
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_driver public.drivers%ROWTYPE;
  v_total NUMERIC(14, 2);
  v_refunded BOOLEAN := FALSE;
  v_refund_status TEXT := 'none';
  v_kpi_cut BOOLEAN := FALSE;
  -- Status yang uangnya sudah ter-capture → wajib refund saat dibatalkan.
  v_paid_statuses CONSTANT TEXT[] :=
    ARRAY['paid', 'preparing', 'ready_for_pickup', 'on_the_way'];
BEGIN
  -- Validasi input di lapisan DB juga (jangan percaya caller sepenuhnya).
  IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Alasan pembatalan minimal 5 karakter';
  END IF;
  IF p_admin_id IS NULL THEN
    RAISE EXCEPTION 'Identitas admin wajib untuk jejak audit';
  END IF;

  -- KUNCI baris order (anti race condition): pemroses lain yang menyentuh
  -- order ini (driver complete, webhook pembayaran, admin lain) akan antri,
  -- lalu melihat status 'cancelled' dan gagal di guard masing-masing.
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pesanan tidak ditemukan';
  END IF;

  -- Guard status: hanya order berjalan yang boleh dibatalkan. Mencegah
  -- double-cancel (refund ganda) dan pembatalan order yang sudah selesai.
  IF v_order.order_status NOT IN (
    'pending_payment', 'paid', 'preparing', 'ready_for_pickup', 'on_the_way'
  ) THEN
    RAISE EXCEPTION 'Pesanan tidak bisa dibatalkan (status: %)', v_order.order_status;
  END IF;

  -- Guard yurisdiksi (defense-in-depth, dievaluasi DI DALAM lock yang sama):
  -- CITY_ADMIN dilarang keras membatalkan order di luar city_id miliknya.
  IF p_admin_city_id IS NOT NULL
     AND v_order.city_id IS DISTINCT FROM p_admin_city_id THEN
    RAISE EXCEPTION 'Di luar yurisdiksi: order milik kota lain';
  END IF;
  IF p_admin_province_id IS NOT NULL
     AND v_order.province_id IS DISTINCT FROM p_admin_province_id THEN
    RAISE EXCEPTION 'Di luar yurisdiksi: order milik provinsi lain';
  END IF;

  v_total := COALESCE(v_order.total_product_amount, 0) + COALESCE(v_order.delivery_fee, 0);

  -- ---------------------------------------------------------------------------
  -- DRIVER: kembalikan ke AVAILABLE ('idle') + potong KPI harian kondisional.
  -- ---------------------------------------------------------------------------
  IF v_order.driver_id IS NOT NULL THEN
    -- Lock baris driver agar tidak bentrok dengan update status dari app driver.
    SELECT * INTO v_driver
    FROM public.drivers
    WHERE id = v_order.driver_id
    FOR UPDATE;

    -- Hanya turunkan dari 'delivering' → 'idle'. Driver 'offline' TIDAK
    -- dipaksa online (mencegah dispatch ke driver yang sudah pulang).
    IF FOUND AND v_driver.status = 'delivering' THEN
      UPDATE public.drivers
      SET status = 'idle'
      WHERE id = v_driver.id;
    END IF;

    -- KPI dipotong HANYA bila driver sudah menerima job (ready_for_pickup /
    -- on_the_way). Pembatalan saat masih 'paid' (belum ada penerimaan riil)
    -- tidak menghukum driver — fairness terhadap skor dispatch 7 hari.
    IF v_order.order_status IN ('ready_for_pickup', 'on_the_way') THEN
      PERFORM public.record_driver_kpi_event(
        v_order.driver_id, 'order_cancelled_after_accept'
      );
      v_kpi_cut := TRUE;
    END IF;
  END IF;

  -- ---------------------------------------------------------------------------
  -- REFUND: 100% otomatis ke dompet customer bila bayar pakai saldo wallet.
  -- ---------------------------------------------------------------------------
  IF v_order.order_status = ANY (v_paid_statuses) THEN
    IF v_order.payment_method = 'wallet' THEN
      -- wallet_apply_tx mengunci baris wallet (FOR UPDATE) → saldo tidak bisa
      -- balapan dengan topup/penarikan; ledger wallet_transactions tercatat
      -- dengan balance_after sebagai bukti audit.
      PERFORM public.wallet_apply_tx(
        'customer'::public.wallet_owner_type,
        v_order.customer_id,
        v_total,                       -- kredit penuh 100%
        'order_refund'::public.wallet_tx_type,
        v_order.id,
        NULL,
        'Refund pembatalan darurat admin: ' || LEFT(TRIM(p_reason), 200)
      );
      v_refunded := TRUE;
      v_refund_status := 'full_refund';
    ELSE
      -- Pembayaran gateway (Midtrans): refund TIDAK boleh otomatis dari DB —
      -- harus lewat dashboard Midtrans. Tandai untuk tindak lanjut manual.
      v_refund_status := 'pending_midtrans';
    END IF;
  END IF;

  -- ---------------------------------------------------------------------------
  -- ORDER: status final + jejak audit lengkap (siapa, kapan, kenapa).
  -- ---------------------------------------------------------------------------
  UPDATE public.orders
  SET
    order_status = 'cancelled',
    admin_cancel_reason = TRIM(p_reason),
    admin_cancelled_at = NOW(),
    admin_cancelled_by = p_admin_id,
    refund_status = v_refund_status,
    refund_amount = CASE WHEN v_refund_status = 'none' THEN 0 ELSE v_total END,
    driver_id = NULL,          -- lepaskan penugasan
    offered_driver_id = NULL,  -- batalkan penawaran yang sedang berjalan
    offered_at = NULL
  WHERE id = v_order.id;

  -- Hasil terstruktur untuk Server Action (tanpa perlu query ulang).
  RETURN jsonb_build_object(
    'ok', TRUE,
    'order_id', v_order.id,
    'previous_status', v_order.order_status,
    'refunded_to_wallet', v_refunded,
    'refund_status', v_refund_status,
    'refund_amount', CASE WHEN v_refund_status = 'none' THEN 0 ELSE v_total END,
    'driver_released', v_order.driver_id IS NOT NULL,
    'driver_kpi_cut', v_kpi_cut
  );
END;
$$;

-- Hanya backend (service_role) yang boleh eksekusi — anon/authenticated TIDAK.
REVOKE ALL ON FUNCTION public.execute_admin_order_cancellation FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_admin_order_cancellation TO service_role;

COMMENT ON FUNCTION public.execute_admin_order_cancellation IS
  'Pembatalan darurat admin: cancel order + driver idle + potong KPI + refund wallet 100% — atomic, FOR UPDATE, guard yurisdiksi.';
