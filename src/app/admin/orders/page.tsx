import {
  applyRegionalOrderScope,
  regionalDashboardTitle,
  verifyAdminSession,
} from "@/app/utils/adminAuth";
import { formatIdr } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { isOrderCancellable } from "@/lib/admin-order-ops";
import { CancelOrderButton } from "./cancel-order-button";
import type { OrderStatus } from "@/types/database";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "Menunggu bayar",
  paid: "Dibayar",
  preparing: "Disiapkan",
  ready_for_pickup: "Siap diambil",
  on_the_way: "Dalam perjalanan",
  delivered: "Selesai",
  cancelled: "Dibatalkan",
};

const REFUND_LABEL: Record<string, string> = {
  full_refund: "Refund penuh",
  pending_midtrans: "Refund Midtrans (manual)",
};

/**
 * Daftar pesanan regional — Server Component.
 * Filter presisi server-side (city_id / province_id) mengurangi beban PostgreSQL.
 */
export default async function AdminRegionalOrdersPage() {
  const session = await verifyAdminSession();
  const supabase = await createClient();

  let query = supabase
    .from("orders")
    .select(
      "id, order_status, total_product_amount, delivery_fee, delivery_address, created_at, province_id, city_id, refund_status, admin_cancel_reason, merchants(name), profiles:customer_id(name)"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  query = applyRegionalOrderScope(query, session);

  const { data: orders, error } = await query;

  const title = regionalDashboardTitle(session);
  const scopeHint =
    session.adminRole === "SUPER_ADMIN"
      ? "Seluruh wilayah Indonesia"
      : session.adminRole === "PROVINCE_ADMIN"
        ? `Provinsi ${session.provinceName ?? session.provinceId}`
        : `Kota ${session.cityName ?? session.cityId}`;

  return (
    <main className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pesanan operasional — lingkup: {scopeHint}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Tier: {session.adminRole} · RLS RESTRICTIVE aktif di PostgreSQL
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          Gagal memuat pesanan: {error.message}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-muted-foreground">
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Merchant</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">Wilayah</th>
              <th className="px-4 py-3">Waktu</th>
              <th className="px-4 py-3">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {(orders ?? []).map((o) => {
              const merchant = Array.isArray(o.merchants)
                ? o.merchants[0]
                : o.merchants;
              const customer = Array.isArray(o.profiles)
                ? o.profiles[0]
                : o.profiles;
              const total =
                Number(o.total_product_amount ?? 0) +
                Number(o.delivery_fee ?? 0);

              return (
                <tr key={o.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">
                    {o.id.slice(0, 8).toUpperCase()}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        o.order_status === "cancelled"
                          ? "text-red-600"
                          : undefined
                      }
                    >
                      {STATUS_LABEL[o.order_status] ?? o.order_status}
                    </span>
                    {o.order_status === "cancelled" && o.refund_status && REFUND_LABEL[o.refund_status] && (
                      <p className="mt-0.5 text-[11px] text-amber-600">
                        {REFUND_LABEL[o.refund_status]}
                      </p>
                    )}
                    {o.order_status === "cancelled" && o.admin_cancel_reason && (
                      <p className="mt-0.5 max-w-[200px] truncate text-[11px] text-muted-foreground">
                        Alasan: {o.admin_cancel_reason}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {(merchant as { name?: string } | null)?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {(customer as { name?: string } | null)?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatIdr(total)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    P{o.province_id ?? "—"} / K{o.city_id ?? "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {new Date(o.created_at).toLocaleString("id-ID")}
                  </td>
                  <td className="px-4 py-3">
                    {isOrderCancellable(o.order_status as OrderStatus) ? (
                      <CancelOrderButton
                        orderId={o.id}
                        orderStatus={o.order_status}
                        total={total}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!orders?.length && !error && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  Belum ada pesanan di wilayah Anda
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
