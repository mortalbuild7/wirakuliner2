"use client";

import { formatIdr } from "@/lib/utils";
import type { Order, OrderItem } from "@/types/database";

interface ThermalReceiptProps {
  order: Order;
  items: OrderItem[];
  merchantName: string;
}

/** Optimized for 58mm thermal printers */
export function ThermalReceipt({ order, items, merchantName }: ThermalReceiptProps) {
  return (
    <div
      id="thermal-receipt"
      className="mx-auto w-[280px] bg-white p-4 font-mono text-xs text-black print:w-[58mm] print:p-2"
    >
      <p className="text-center font-bold">WIRA KULINER</p>
      <p className="text-center">{merchantName}</p>
      <p className="my-2 border-y border-dashed border-black py-1 text-center">
        #{order.id.slice(0, 8).toUpperCase()}
      </p>
      <p>{new Date(order.created_at).toLocaleString("id-ID")}</p>
      <p className="mt-2">{order.delivery_address}</p>
      <div className="my-2 border-t border-dashed border-black pt-2">
        {items.map((item) => (
          <div key={item.id} className="mb-1 flex justify-between">
            <span>
              {item.quantity}x {item.product_name}
            </span>
            <span>{formatIdr(item.price * item.quantity)}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-dashed border-black pt-2">
        <div className="flex justify-between">
          <span>Produk</span>
          <span>{formatIdr(Number(order.total_product_amount))}</span>
        </div>
        <div className="flex justify-between">
          <span>Ongkir</span>
          <span>{formatIdr(Number(order.delivery_fee))}</span>
        </div>
        <div className="mt-1 flex justify-between font-bold">
          <span>TOTAL</span>
          <span>
            {formatIdr(
              Number(order.total_product_amount) + Number(order.delivery_fee)
            )}
          </span>
        </div>
      </div>
      <p className="mt-4 text-center">Terima kasih!</p>
    </div>
  );
}
