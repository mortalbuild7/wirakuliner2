import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPosAddress } from "@/lib/order-channel";
import {
  enforceMethod,
  enforceRateLimit,
  readJsonBody,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { isValidUuid, parseBoundedNumber, sanitizeText } from "@/lib/security/validate";

type PosLine = {
  productId: string;
  quantity: number;
  price: number;
  name: string;
};

export async function POST(req: Request) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "pos-order", RATE_LIMITS.apiWrite);
  if (rl) return rl;

  try {
    const parsed = await readJsonBody<{
      items?: PosLine[];
      customerDisplayName?: string;
      startPreparing?: boolean;
    }>(req);
    if ("error" in parsed) return parsed.error;
    const body = parsed.data;

    const rawItems = Array.isArray(body.items) ? body.items : [];
    const items = rawItems
      .filter((i) => i && isValidUuid(i.productId))
      .map((i) => ({
        productId: i.productId,
        quantity: parseBoundedNumber(i.quantity, 1, 99) ?? 0,
        price: parseBoundedNumber(i.price, 0, 50_000_000) ?? 0,
        name: sanitizeText(i.name, 120) ?? "Item",
      }))
      .filter((i) => i.quantity > 0);

    if (!items.length || items.length > 50) {
      return secureJsonResponse({ error: "Keranjang tidak valid" }, { status: 400 });
    }

    const guestName = sanitizeText(body.customerDisplayName, 80);

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return secureJsonResponse({ error: "Belum login" }, { status: 401 });
    }

    const { data: merchant } = await supabase
      .from("merchants")
      .select("id, name, latitude, longitude, owner_id")
      .eq("owner_id", user.id)
      .single();

    if (!merchant) {
      return secureJsonResponse({ error: "Toko tidak ditemukan" }, { status: 404 });
    }

    const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
    const admin = createAdminClient();

    const { data: order, error: orderError } = await admin
      .from("orders")
      .insert({
        customer_id: merchant.owner_id,
        merchant_id: merchant.id,
        total_product_amount: subtotal,
        delivery_fee: 0,
        is_outside_radius: false,
        negotiation_status: "none",
        order_status: body.startPreparing ? "preparing" : "pending_payment",
        delivery_address: formatPosAddress(guestName ?? undefined),
        delivery_lat: merchant.latitude,
        delivery_lng: merchant.longitude,
        distance_km: 0,
        payment_gateway: "cash_pos",
      })
      .select("*, order_items(*)")
      .single();

    if (orderError || !order) {
      return secureJsonResponse(
        { error: orderError?.message ?? "Gagal membuat pesanan" },
        { status: 500 }
      );
    }

    const lineRows = items.map((i) => ({
      order_id: order.id,
      product_id: i.productId,
      quantity: i.quantity,
      price: i.price,
      product_name: i.name,
    }));

    const { error: itemsError } = await admin.from("order_items").insert(lineRows);
    if (itemsError) {
      await admin.from("orders").delete().eq("id", order.id);
      return secureJsonResponse({ error: itemsError.message }, { status: 500 });
    }

    const { data: full } = await admin
      .from("orders")
      .select("*, order_items(*)")
      .eq("id", order.id)
      .single();

    return secureJsonResponse({
      ok: true,
      order: full,
      merchantName: merchant.name,
    });
  } catch (e) {
    return secureJsonResponse(
      { error: e instanceof Error ? e.message : "Gagal membuat pesanan POS" },
      { status: 500 }
    );
  }
}
