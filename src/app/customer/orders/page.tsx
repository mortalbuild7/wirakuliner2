"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { formatIdr, merchantNameFromJoin } from "@/lib/utils";
import type { Order } from "@/types/database";
import { Package, ChevronRight } from "lucide-react";

export default function CustomerOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const user = session?.user;
      if (!user) return;
      const { data } = await supabase
        .from("orders")
        .select("*, merchants(name)")
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false });
      setOrders((data as Order[]) ?? []);
    });
  }, []);

  return (
    <main className="px-4 py-4">
      <h1 className="text-xl font-bold text-white">Pesanan Saya</h1>
      <p className="text-sm text-muted-foreground">Lacak status antar</p>

      <ul className="mt-4 space-y-3">
        {orders.map((o) => (
          <li key={o.id}>
            <Link
              href={`/customer/orders/${o.id}`}
              className="glass-card block p-4 transition active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/20">
                    <Package className="h-5 w-5 text-cyan-400" />
                  </div>
                  <div>
                    <span className="font-medium text-white">
                      {merchantNameFromJoin(
                        (o as Order & { merchants?: { name: string } | { name: string }[] }).merchants,
                        "Toko"
                      )}
                    </span>
                    <p className="line-clamp-1 text-xs text-muted-foreground">{o.delivery_address}</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <Badge variant="secondary" className="border-0 bg-white/10 text-xs">
                  {o.order_status}
                </Badge>
                <p className="font-semibold text-cyan-300">
                  {formatIdr(Number(o.total_product_amount) + Number(o.delivery_fee))}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {orders.length === 0 && (
        <p className="py-16 text-center text-sm text-muted-foreground">Belum ada pesanan</p>
      )}
    </main>
  );
}
