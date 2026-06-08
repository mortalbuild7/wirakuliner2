import { isNgojekOrder } from "@/lib/order-channel";
import type { SupabaseClient } from "@supabase/supabase-js";

export type RatingTargetType = "driver" | "merchant";

export type OrderRatingRow = {
  id: string;
  order_id: string;
  customer_id: string;
  target_type: RatingTargetType;
  target_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

export type ReceivedReview = OrderRatingRow & {
  customer_name: string;
  order_label: string | null;
};

export function getRateableTargets(order: {
  delivery_address: string;
  driver_id: string | null;
  merchant_id: string;
}): RatingTargetType[] {
  const targets: RatingTargetType[] = [];
  const isRide = isNgojekOrder(order.delivery_address);

  if (!isRide) {
    targets.push("merchant");
  }
  if (order.driver_id) {
    targets.push("driver");
  }
  return targets;
}

export async function listOrderRatings(
  admin: SupabaseClient,
  orderId: string,
  customerId: string
): Promise<OrderRatingRow[]> {
  const { data } = await admin
    .from("order_ratings")
    .select("*")
    .eq("order_id", orderId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: true });

  return (data ?? []) as OrderRatingRow[];
}

export async function submitOrderRating(
  admin: SupabaseClient,
  params: {
    orderId: string;
    customerId: string;
    targetType: RatingTargetType;
    rating: number;
    comment?: string;
  }
): Promise<OrderRatingRow> {
  const { data: order } = await admin
    .from("orders")
    .select("id, customer_id, order_status, driver_id, merchant_id, delivery_address")
    .eq("id", params.orderId)
    .maybeSingle();

  if (!order || order.customer_id !== params.customerId) {
    throw new Error("Pesanan tidak ditemukan");
  }
  if (order.order_status !== "delivered") {
    throw new Error("Rating hanya untuk pesanan yang sudah selesai");
  }

  const allowed = getRateableTargets(order);
  if (!allowed.includes(params.targetType)) {
    throw new Error("Tidak bisa memberi rating untuk bagian ini");
  }

  const targetId =
    params.targetType === "driver" ? order.driver_id : order.merchant_id;
  if (!targetId) {
    throw new Error("Target rating tidak valid");
  }

  const comment = params.comment?.trim().slice(0, 500) || null;

  const { data: row, error } = await admin
    .from("order_ratings")
    .upsert(
      {
        order_id: params.orderId,
        customer_id: params.customerId,
        target_type: params.targetType,
        target_id: targetId,
        rating: params.rating,
        comment,
      },
      { onConflict: "order_id,target_type" }
    )
    .select("*")
    .single();

  if (error || !row) {
    throw new Error(error?.message ?? "Gagal menyimpan rating");
  }

  return row as OrderRatingRow;
}

export async function listReceivedReviews(
  admin: SupabaseClient,
  targetType: RatingTargetType,
  targetId: string,
  limit = 20
): Promise<ReceivedReview[]> {
  const { data: ratings } = await admin
    .from("order_ratings")
    .select("*")
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!ratings?.length) return [];

  const customerIds = [...new Set(ratings.map((r) => r.customer_id as string))];
  const orderIds = [...new Set(ratings.map((r) => r.order_id as string))];

  const [{ data: profiles }, { data: orders }] = await Promise.all([
    admin.from("profiles").select("id, name").in("id", customerIds),
    admin
      .from("orders")
      .select("id, delivery_address")
      .in("id", orderIds),
  ]);

  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id as string, (p.name as string) || "Customer"])
  );
  const orderById = new Map(
    (orders ?? []).map((o) => [o.id as string, o.delivery_address as string])
  );

  return (ratings as OrderRatingRow[]).map((r) => ({
    ...r,
    customer_name: nameById.get(r.customer_id) ?? "Customer",
    order_label: orderById.get(r.order_id) ?? null,
  }));
}

export async function getRatingSummary(
  admin: SupabaseClient,
  targetType: RatingTargetType,
  targetId: string
): Promise<{ avg: number; count: number }> {
  const table = targetType === "driver" ? "drivers" : "merchants";
  const { data } = await admin
    .from(table)
    .select("rating_avg, rating_count")
    .eq("id", targetId)
    .maybeSingle();

  return {
    avg: Number(data?.rating_avg ?? 0),
    count: Number(data?.rating_count ?? 0),
  };
}
