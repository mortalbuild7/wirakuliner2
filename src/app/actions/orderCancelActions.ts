"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { verifyAdminSession } from "@/app/utils/adminAuth";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Server Action — Pembatalan Darurat Admin (Emergency Cancellation).
 *
 * Lapisan keamanan:
 * 1. `verifyAdminSession()` — JWT divalidasi server-side (anti session
 *    hijacking), hard-check `profiles.role = 'admin'` + tier valid + MFA aal2.
 * 2. Validasi input `zod` — orderId wajib UUID (anti injection / path abuse),
 *    alasan minimal 5 karakter (jejak audit bermakna).
 * 3. Pembatasan yurisdiksi — CITY_ADMIN hanya kota miliknya, PROVINCE_ADMIN
 *    hanya provinsinya; diteruskan ke RPC agar dicek ULANG di dalam lock DB.
 * 4. Eksekusi finansial via RPC `execute_admin_order_cancellation` — satu
 *    transaction block dengan SELECT FOR UPDATE (anti race condition).
 */

const CancelOrderSchema = z.object({
  // UUID ketat: mencegah string sembarang masuk ke kueri (defense pertama).
  orderId: z.uuid({ message: "Order ID tidak valid" }),
  // Minimal 5 karakter agar alasan audit tidak kosong/asal (mis. "x").
  reason: z
    .string()
    .trim()
    .min(5, "Alasan pembatalan minimal 5 karakter")
    .max(500, "Alasan maksimal 500 karakter"),
});

export type CancelOrderResult =
  | {
      ok: true;
      message: string;
      refundStatus: string;
      refundAmount: number;
    }
  | { ok: false; error: string };

export async function cancelOrderEmergency(
  input: z.infer<typeof CancelOrderSchema>
): Promise<CancelOrderResult> {
  // 1. AUTENTIKASI + OTORISASI — redirect ke login/unauthorized bila gagal,
  //    sehingga aksi tidak pernah berjalan tanpa sesi admin yang sah + MFA.
  const session = await verifyAdminSession();

  // 2. VALIDASI INPUT — safeParse agar pesan error rapi, bukan exception 500.
  const parsed = CancelOrderSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Input tidak valid",
    };
  }
  const { orderId, reason } = parsed.data;

  // 3. LINGKUP YURISDIKSI — dipetakan dari tier sesi, BUKAN dari input client
  //    (client tidak pernah bisa memilih lingkupnya sendiri).
  //    CITY_ADMIN  → wajib cocok city_id; PROVINCE_ADMIN → wajib cocok
  //    province_id; SUPER_ADMIN → tanpa batasan (NULL).
  const adminCityId =
    session.adminRole === "CITY_ADMIN" ? session.cityId : null;
  const adminProvinceId =
    session.adminRole === "PROVINCE_ADMIN" ? session.provinceId : null;

  // Pre-check yurisdiksi di luar transaction: gagal cepat dengan pesan jelas
  // sebelum menyentuh lock. RPC tetap mengecek ULANG di dalam lock
  // (defense-in-depth) untuk menutup celah TOCTOU.
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, city_id, province_id, order_status")
    .eq("id", orderId)
    .single();

  if (!order) {
    return { ok: false, error: "Pesanan tidak ditemukan" };
  }
  if (adminCityId != null && order.city_id !== adminCityId) {
    return {
      ok: false,
      error: "Ditolak: pesanan ini di luar yurisdiksi kota Anda",
    };
  }
  if (adminProvinceId != null && order.province_id !== adminProvinceId) {
    return {
      ok: false,
      error: "Ditolak: pesanan ini di luar yurisdiksi provinsi Anda",
    };
  }

  // 4. EKSEKUSI ATOMIC — seluruh mutasi finansial & operasional terjadi di
  //    satu transaction PostgreSQL; gagal sebagian = rollback semua.
  const { data, error } = await admin.rpc("execute_admin_order_cancellation", {
    p_order_id: orderId,
    p_admin_id: session.userId,
    p_reason: reason,
    p_admin_city_id: adminCityId,
    p_admin_province_id: adminProvinceId,
  });

  if (error) {
    // Pesan exception plpgsql (status tidak valid, yurisdiksi, dll.)
    // diteruskan apa adanya — tidak membocorkan detail internal lain.
    return { ok: false, error: error.message };
  }

  const result = data as {
    refund_status: string;
    refund_amount: number;
    refunded_to_wallet: boolean;
    driver_kpi_cut: boolean;
  };

  // 5. SINKRONISASI UI — tabel pesanan dirender ulang dari data terbaru.
  revalidatePath("/admin/orders");

  const message = result.refunded_to_wallet
    ? "Pesanan dibatalkan. Refund 100% sudah masuk ke dompet customer."
    : result.refund_status === "pending_midtrans"
      ? "Pesanan dibatalkan. Refund Midtrans perlu diproses manual di dashboard Midtrans."
      : "Pesanan dibatalkan (belum ada pembayaran ter-capture).";

  return {
    ok: true,
    message,
    refundStatus: result.refund_status,
    refundAmount: Number(result.refund_amount ?? 0),
  };
}
