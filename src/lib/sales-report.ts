import { parseOrderChannel, type OrderChannel } from "@/lib/order-channel";
import { orderTotalAmount } from "@/lib/pos-cash";
import type { Order, OrderItem } from "@/types/database";

export type ReportPeriod = "today" | "7d" | "30d" | "365d";

export const REPORT_PERIOD_LABELS: Record<ReportPeriod, string> = {
  today: "Hari ini",
  "7d": "7 hari terakhir",
  "30d": "1 bulan terakhir",
  "365d": "1 tahun terakhir",
};

/** Pesanan yang sudah dibayar / diproses — dihitung sebagai penjualan */
export const SALES_ORDER_STATUSES = [
  "paid",
  "preparing",
  "on_the_way",
  "delivered",
] as const;

export type SalesOrderRow = {
  id: string;
  createdAt: string;
  status: string;
  channel: OrderChannel;
  productAmount: number;
  deliveryFee: number;
  total: number;
};

export type TopProductRow = {
  name: string;
  quantity: number;
  revenue: number;
};

export type SalesReportSummary = {
  orderCount: number;
  productRevenue: number;
  deliveryRevenue: number;
  totalRevenue: number;
  posOrders: number;
  dineInOrders: number;
  deliveryOrders: number;
};

export type SalesReportData = {
  period: ReportPeriod;
  periodLabel: string;
  rangeLabel: string;
  generatedAt: string;
  merchantName: string;
  summary: SalesReportSummary;
  topProducts: TopProductRow[];
  orders: SalesOrderRow[];
};

export function getReportDateRange(period: ReportPeriod): {
  start: Date;
  end: Date;
  rangeLabel: string;
} {
  const end = new Date();
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  switch (period) {
    case "today":
      break;
    case "7d":
      start.setDate(start.getDate() - 6);
      break;
    case "30d":
      start.setDate(start.getDate() - 29);
      break;
    case "365d":
      start.setDate(start.getDate() - 364);
      break;
  }

  const fmt = (d: Date) =>
    d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

  const rangeLabel =
    period === "today" ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;

  return { start, end, rangeLabel };
}

export function buildSalesReport(
  merchantName: string,
  period: ReportPeriod,
  orders: (Order & { order_items?: OrderItem[] })[]
): SalesReportData {
  const { rangeLabel } = getReportDateRange(period);
  const productQty = new Map<string, { name: string; quantity: number; revenue: number }>();

  let productRevenue = 0;
  let deliveryRevenue = 0;
  let posOrders = 0;
  let dineInOrders = 0;
  let deliveryOrders = 0;

  const rows: SalesOrderRow[] = orders.map((o) => {
    const channel = parseOrderChannel(o.delivery_address);
    const productAmount = Number(o.total_product_amount);
    const deliveryFee = Number(o.delivery_fee);
    const total = orderTotalAmount(productAmount, deliveryFee);

    productRevenue += productAmount;
    deliveryRevenue += deliveryFee;
    if (channel === "pos") posOrders += 1;
    else if (channel === "dine_in") dineInOrders += 1;
    else deliveryOrders += 1;

    for (const item of o.order_items ?? []) {
      const key = item.product_name;
      const ex = productQty.get(key) ?? { name: key, quantity: 0, revenue: 0 };
      ex.quantity += item.quantity;
      ex.revenue += Number(item.price) * item.quantity;
      productQty.set(key, ex);
    }

    return {
      id: o.id,
      createdAt: o.created_at,
      status: o.order_status,
      channel,
      productAmount,
      deliveryFee,
      total,
    };
  });

  const topProducts = [...productQty.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  return {
    period,
    periodLabel: REPORT_PERIOD_LABELS[period],
    rangeLabel,
    generatedAt: new Date().toISOString(),
    merchantName,
    summary: {
      orderCount: rows.length,
      productRevenue,
      deliveryRevenue,
      totalRevenue: productRevenue + deliveryRevenue,
      posOrders,
      dineInOrders,
      deliveryOrders,
    },
    topProducts,
    orders: rows.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ),
  };
}

export function channelReportLabel(ch: OrderChannel) {
  if (ch === "pos") return "Kasir";
  if (ch === "dine_in") return "Di tempat";
  return "Antar";
}
