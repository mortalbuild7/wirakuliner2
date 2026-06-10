import { getAuthDriver } from "@/lib/driver-server";
import { DRIVER_REWARD_POINTS_PER_ORDER } from "@/lib/order-flow";
import { settleOrderFinancials } from "@/lib/app-finance";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { rejectTrustedOwnerIdsInBody } from "@/lib/security/auth-owner";
import {
  enforceMethod,
  enforceRateLimit,
  readJsonBody,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { isValidUuid } from "@/lib/security/validate";

/**
 * ALUR AKSES DATA — Anti IDOR / BOLA
 *
 * Pola keamanan:
 * 1. Identitas dari JWT Supabase (`getUser` / `getAuthDriver`) — BUKAN dari body.
 * 2. Tolak body yang menyisipkan driver_id / customer_id (IDOR).
 * 3. Verifikasi order.driver_id === driver.id dari token sebelum UPDATE.
 * 4. RLS di PostgreSQL menjadi lapisan kedua (lihat docs/SUPABASE-RLS-GUIDE.md).
 *
 * Catatan: Customer tidak menyelesaikan pengantaran; hanya driver yang assigned.
 */
export async function POST(req: Request) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "orders-complete", RATE_LIMITS.apiWrite);
  if (rl) return rl;

  const parsed = await readJsonBody<{
    orderId?: string;
    driver_id?: string;
    customer_id?: string;
  }>(req);
  if ("error" in parsed) return parsed.error;

  const idorBlock = rejectTrustedOwnerIdsInBody(parsed.data as Record<string, unknown>);
  if (idorBlock) return idorBlock;

  const orderId = parsed.data.orderId;
  if (!isValidUuid(orderId)) {
    return secureJsonResponse({ error: "Order tidak valid" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return secureJsonResponse({ error: "Belum login" }, { status: 401 });
  }

  const driverAuth = await getAuthDriver();
  if ("error" in driverAuth) {
    return secureJsonResponse(
      { error: "Hanya driver terautentikasi yang dapat menyelesaikan pengantaran" },
      { status: 403 }
    );
  }

  if (driverAuth.userId !== user.id) {
    return secureJsonResponse({ error: "Token tidak cocok dengan sesi driver" }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: order } = await admin
    .from("orders")
    .select("id, customer_id, driver_id, order_status")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) {
    return secureJsonResponse({ error: "Pesanan tidak ditemukan" }, { status: 404 });
  }

  if (order.driver_id !== driverAuth.driver.id) {
    return secureJsonResponse(
      {
        error:
          "Akses ditolak — order ini bukan milik driver yang login (anti IDOR)",
      },
      { status: 403 }
    );
  }

  if (order.order_status !== "on_the_way") {
    return secureJsonResponse(
      { error: "Pesanan harus berstatus dalam perjalanan" },
      { status: 400 }
    );
  }

  const { error: orderErr } = await admin
    .from("orders")
    .update({ order_status: "delivered" })
    .eq("id", orderId)
    .eq("driver_id", driverAuth.driver.id);

  if (orderErr) {
    return secureJsonResponse({ error: orderErr.message }, { status: 500 });
  }

  let walletCredited = false;
  try {
    const settlement = await settleOrderFinancials(admin, orderId);
    walletCredited = settlement.ok && !settlement.alreadySettled;
  } catch {
    /* settlement best-effort; order tetap delivered */
  }

  let pointsAwarded = 0;
  const { data: existing } = await admin
    .from("driver_point_transactions")
    .select("id")
    .eq("order_id", orderId)
    .eq("driver_id", driverAuth.driver.id)
    .maybeSingle();

  if (!existing) {
    const current = driverAuth.driver.reward_points ?? 0;
    await admin
      .from("drivers")
      .update({ reward_points: current + DRIVER_REWARD_POINTS_PER_ORDER })
      .eq("id", driverAuth.driver.id);
    await admin.from("driver_point_transactions").insert({
      driver_id: driverAuth.driver.id,
      order_id: orderId,
      points: DRIVER_REWARD_POINTS_PER_ORDER,
      reason: "delivery_complete",
    });
    pointsAwarded = DRIVER_REWARD_POINTS_PER_ORDER;
  }

  return secureJsonResponse({
    ok: true,
    orderId,
    pointsAwarded,
    walletCredited,
    message: "Pesanan selesai — diverifikasi via JWT + driver_id match",
  });
}
