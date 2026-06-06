import {
  deliveryZoneCenter,
  distanceToZone,
  FLAT_DELIVERY_FEE_IDR,
  isWithinDeliveryZone,
} from "@/lib/geo-config";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const DEFAULT_NEGO_FEE = 25_000;

export async function startOrderNegotiation(
  orderId: string,
  accuracyM?: number | null
): Promise<
  | {
      ok: true;
      corrected?: boolean;
      withinRadius?: boolean;
      driversNotified: number;
      negotiationsCreated: number;
    }
  | { error: string; status: number }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum login", status: 401 };

  const admin = createAdminClient();
  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select(
      "id, customer_id, merchant_id, delivery_lat, delivery_lng, delivery_address, negotiation_status, is_outside_radius, merchants(latitude, longitude, name)"
    )
    .eq("id", orderId)
    .single();

  if (orderErr || !order) return { error: "Pesanan tidak ditemukan", status: 404 };
  if (order.customer_id !== user.id) return { error: "Bukan pesanan Anda", status: 403 };

  const merchant = Array.isArray(order.merchants)
    ? order.merchants[0]
    : order.merchants;
  const zone = deliveryZoneCenter(
    merchant?.latitude,
    merchant?.longitude,
    merchant?.name
  );
  if (!zone) {
    return { error: "Toko belum memiliki koordinat GPS", status: 400 };
  }

  const distance = distanceToZone(
    order.delivery_lat,
    order.delivery_lng,
    zone.lat,
    zone.lng
  );
  const within = isWithinDeliveryZone(
    order.delivery_lat,
    order.delivery_lng,
    zone.lat,
    zone.lng,
    accuracyM
  );

  if (within) {
    await admin
      .from("orders")
      .update({
        is_outside_radius: false,
        negotiation_status: "none",
        delivery_fee: FLAT_DELIVERY_FEE_IDR,
        distance_km: distance,
      })
      .eq("id", orderId);

    return {
      ok: true,
      corrected: true,
      withinRadius: true,
      driversNotified: 0,
      negotiationsCreated: 0,
    };
  }

  await admin
    .from("orders")
    .update({
      is_outside_radius: true,
      negotiation_status: "negotiating",
      distance_km: distance,
    })
    .eq("id", orderId);

  const { data: drivers } = await admin.from("drivers").select("id").eq("status", "idle");

  let negotiationsCreated = 0;
  for (const d of drivers ?? []) {
    const { error } = await admin.from("negotiations").upsert(
      {
        order_id: orderId,
        driver_id: d.id,
        proposed_fee: DEFAULT_NEGO_FEE,
        status: "pending",
      },
      { onConflict: "order_id,driver_id" }
    );
    if (!error) negotiationsCreated += 1;
  }

  let driversNotified = 0;
  const fnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-driver-push`;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (fnUrl && serviceKey) {
    const res = await fetch(fnUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        type: "negotiation",
        record: {
          id: order.id,
          is_outside_radius: true,
          negotiation_status: "negotiating",
          delivery_address: order.delivery_address,
        },
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { sent?: number };
    driversNotified = json.sent ?? drivers?.length ?? 0;
  }

  return {
    ok: true,
    corrected: false,
    withinRadius: false,
    driversNotified,
    negotiationsCreated,
  };
}
