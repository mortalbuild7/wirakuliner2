"use client";

import { useParams } from "next/navigation";
import { OrderTracker } from "@/components/customer/order-tracker";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function OrderTrackingPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <main className="mx-auto max-w-lg px-4 py-4 text-slate-900">
      <h1 className="mb-4 text-xl font-bold text-slate-900">Lacak Pesanan</h1>
      <OrderTracker orderId={id} />
      <Link href="/customer/orders" className="mt-6 block">
        <Button variant="outline" className="w-full">
          Kembali ke daftar pesanan
        </Button>
      </Link>
    </main>
  );
}
