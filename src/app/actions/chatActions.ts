"use server";

/**
 * Server Action — kirim pesan chat order (Customer ↔ Driver)
 *
 * Arsitektur stateless:
 * - Tidak ada session chat di memori server; pesan langsung ke PostgreSQL
 * - Supabase Realtime menyiarkan INSERT ke subscriber `room:{orderId}`
 *
 * Lapisan keamanan:
 * 1. Zod strict — whitelist field, batas panjang
 * 2. Zod transform + sanitizeChatMessageForStorage — strip tag & escape HTML (Anti-XSS)
 * 3. Verifikasi partisipan (customer_id / driver_id) di server
 * 4. Cek status order aktif sebelum insert
 * 5. Insert via klien user → RLS + trigger DB sebagai belt-and-suspenders
 */

import { sendChatMessageSchema } from "@/lib/chat/chat-schemas";
import { isOrderChatOpen } from "@/lib/order-chat";
import { createClient } from "@/lib/supabase/server";

export type ChatActionResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string; status?: number };

export async function sendChatMessage(
  orderId: string,
  message: string
): Promise<ChatActionResult> {
  const parsed = sendChatMessageSchema.safeParse({ orderId, message });
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join("; ");
    return { ok: false, error: msg || "Payload tidak valid", status: 400 };
  }

  const cleaned = parsed.data.message;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { ok: false, error: "Belum login", status: 401 };
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, customer_id, driver_id, order_status")
    .eq("id", parsed.data.orderId)
    .maybeSingle();

  if (orderError || !order) {
    return { ok: false, error: "Pesanan tidak ditemukan", status: 404 };
  }

  const { data: driver } = await supabase
    .from("drivers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();

  const isCustomer = order.customer_id === user.id;
  const isDriver = driver?.id != null && order.driver_id === driver.id;

  if (!isCustomer && !isDriver) {
    return { ok: false, error: "Akses ditolak", status: 403 };
  }

  if (!isOrderChatOpen(order)) {
    return {
      ok: false,
      error: "Pesanan telah selesai, chat dinonaktifkan",
      status: 403,
    };
  }

  const { data: row, error: insertError } = await supabase
    .from("order_chats")
    .insert({
      order_id: parsed.data.orderId,
      sender_id: user.id,
      message: cleaned,
    })
    .select("id")
    .single();

  if (insertError || !row) {
    const msg = insertError?.message ?? "Gagal mengirim pesan";
    const closed =
      msg.includes("chat dinonaktifkan") || msg.includes("Chat belum aktif");
    return {
      ok: false,
      error: closed ? "Pesanan telah selesai, chat dinonaktifkan" : msg,
      status: closed ? 403 : 400,
    };
  }

  return { ok: true, messageId: row.id as string };
}
