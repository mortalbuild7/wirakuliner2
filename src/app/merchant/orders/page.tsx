"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatIdr } from "@/lib/utils";
import { ThermalReceipt } from "@/components/merchant/thermal-receipt";
import { ReceiptShareStubs } from "@/components/merchant/receipt-share-stubs";
import type { Order, OrderItem } from "@/types/database";

export default function MerchantOrdersPage() {
  const [orders, setOrders] = useState<(Order & { order_items?: OrderItem[] })[]>([]);
  const [printOrder, setPrintOrder] = useState<(Order & { order_items?: OrderItem[] }) | null>(null);
  const [merchantName, setMerchantName] = useState("");
  const merchantIdRef = useRef<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: m } = await supabase
        .from("merchants")
        .select("id, name")
        .eq("owner_id", user.id)
        .single();
      if (!m) return;
      merchantIdRef.current = m.id;
      setMerchantName(m.name);
      const { data } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .eq("merchant_id", m.id)
        .in("order_status", ["paid", "preparing", "on_the_way"])
        .order("created_at", { ascending: false });
      setOrders((data as typeof orders) ?? []);
    };

    load();

    const ch = supabase
      .channel("merchant-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload) => {
        const row = payload.new as { merchant_id?: string } | undefined;
        if (merchantIdRef.current && row?.merchant_id === merchantIdRef.current) {
          load();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  async function acceptOrder(id: string) {
    await supabase.from("orders").update({ order_status: "preparing" }).eq("id", id);
  }

  async function markPrepared(id: string) {
    await supabase.from("orders").update({ order_status: "on_the_way" }).eq("id", id);
  }

  return (
    <main className="p-4 md:p-6">
      <h1 className="text-xl font-bold text-white md:text-2xl">Pesanan Masuk</h1>
      <p className="text-sm text-muted-foreground">Realtime dari customer</p>
      <div className="mt-4 space-y-4">
        {orders.map((o) => (
          <div key={o.id} className="glass-card p-4">
            <div className="flex justify-between">
              <span className="font-mono text-sm">#{o.id.slice(0, 8)}</span>
              <Badge>{o.order_status}</Badge>
            </div>
            <p className="text-sm">{o.delivery_address}</p>
            <p className="font-semibold">
              {formatIdr(Number(o.total_product_amount) + Number(o.delivery_fee))}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {o.order_status === "paid" && (
                <Button size="sm" onClick={() => acceptOrder(o.id)}>Terima Pesanan</Button>
              )}
              {o.order_status === "preparing" && (
                <Button size="sm" onClick={() => markPrepared(o.id)}>Siap Diantar</Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setPrintOrder(o)}>
                Struk Thermal
              </Button>
              <ReceiptShareStubs orderId={o.id} />
            </div>
          </div>
        ))}
      </div>
      {printOrder && printOrder.order_items && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] overflow-auto rounded-lg bg-white">
            <ThermalReceipt
              order={printOrder}
              items={printOrder.order_items}
              merchantName={merchantName}
            />
            <div className="flex gap-2 p-4 print:hidden">
              <Button onClick={() => window.print()}>Cetak</Button>
              <Button variant="outline" onClick={() => setPrintOrder(null)}>Tutup</Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
