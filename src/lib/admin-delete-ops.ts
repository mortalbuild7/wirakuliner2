import type { SupabaseClient } from "@supabase/supabase-js";

/** Hapus semua pesanan (order_items & negotiations cascade). */
export async function deleteAllOrders(admin: SupabaseClient) {
  const { count } = await admin.from("orders").select("id", { count: "exact", head: true });
  if (!count) return { deletedOrders: 0 };

  const { error } = await admin.from("orders").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) throw new Error(error.message);
  return { deletedOrders: count };
}

export async function deleteOrdersForCustomer(admin: SupabaseClient, customerId: string) {
  const { data: orders } = await admin.from("orders").select("id").eq("customer_id", customerId);
  const ids = (orders ?? []).map((o) => o.id);
  if (!ids.length) return;
  const { error } = await admin.from("orders").delete().in("id", ids);
  if (error) throw new Error(error.message);
}

export async function deleteOrdersForMerchant(admin: SupabaseClient, merchantId: string) {
  const { data: orders } = await admin.from("orders").select("id").eq("merchant_id", merchantId);
  const ids = (orders ?? []).map((o) => o.id);
  if (!ids.length) return;
  const { error } = await admin.from("orders").delete().in("id", ids);
  if (error) throw new Error(error.message);
}

export async function deleteAuthUser(admin: SupabaseClient, userId: string) {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
}
