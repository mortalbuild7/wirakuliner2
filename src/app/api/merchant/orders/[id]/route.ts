import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isOnsiteOrder } from "@/lib/order-channel";
import { notifyDriverOrderReady, notifyDriversNewOrder } from "@/lib/notify-drivers";
import {
  enforceMethod,
  enforceRateLimit,
  readJsonBody,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { isValidUuid } from "@/lib/security/validate";
import type { OrderStatus } from "@/types/database";

const ACTIONS = ["start_preparing", "mark_ready"] as const;
type MerchantOrderAction = (typeof ACTIONS)[number];

/** Update status pesanan oleh merchant (bypass RLS). */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const methodBlock = enforceMethod(req, ["PATCH"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "merchant-order-patch", RATE_LIMITS.apiWrite);
  if (rl) return rl;

  const { id } = await params;
  if (!isValidUuid(id)) {
    return secureJsonResponse({ error: "Pesanan tidak valid" }, { status: 400 });
  }

  const parsed = await readJsonBody<{ action?: string }>(req);
  if ("error" in parsed) return parsed.error;

  const action = parsed.data.action as MerchantOrderAction | undefined;
  if (!action || !ACTIONS.includes(action)) {
    return secureJsonResponse({ error: "Aksi tidak valid" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return secureJsonResponse({ error: "Belum login" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: merchant } = await admin
    .from("merchants")
    .select("id, admin_suspended")
    .eq("owner_id", session.user.id)
    .maybeSingle();

  if (!merchant) {
    return secureJsonResponse({ error: "Toko tidak ditemukan" }, { status: 404 });
  }

  if (merchant.admin_suspended) {
    return secureJsonResponse({ error: "Toko ditangguhkan admin" }, { status: 403 });
  }

  const { data: order } = await admin
    .from("orders")
    .select("id, merchant_id, order_status, delivery_address, driver_id")
    .eq("id", id)
    .single();

  if (!order || order.merchant_id !== merchant.id) {
    return secureJsonResponse({ error: "Pesanan tidak ditemukan" }, { status: 404 });
  }

  let nextStatus: OrderStatus;
  if (action === "start_preparing") {
    if (order.order_status !== "paid") {
      return secureJsonResponse(
        { error: `Tidak bisa mulai siapkan dari status: ${order.order_status}` },
        { status: 400 }
      );
    }
    nextStatus = "preparing";
  } else {
    if (order.order_status !== "preparing") {
      return secureJsonResponse(
        { error: `Tidak bisa tandai siap dari status: ${order.order_status}` },
        { status: 400 }
      );
    }
    nextStatus = isOnsiteOrder(order.delivery_address) ? "delivered" : "ready_for_pickup";
  }

  const { data: updated, error } = await admin
    .from("orders")
    .update({ order_status: nextStatus })
    .eq("id", id)
    .select("*, order_items(*)")
    .single();

  if (error || !updated) {
    return secureJsonResponse(
      { error: error?.message ?? "Gagal memperbarui pesanan" },
      { status: 500 }
    );
  }

  if (nextStatus === "ready_for_pickup") {
    if (order.driver_id) {
      await notifyDriverOrderReady(id);
    } else {
      await notifyDriversNewOrder(id);
    }
  }

  return secureJsonResponse({ ok: true, order: updated, orderStatus: nextStatus });
}
