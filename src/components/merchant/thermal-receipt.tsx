"use client";

import { formatIdr } from "@/lib/utils";
import { channelLabel } from "@/lib/order-channel";
import { decodePosCashSnap, type PosCashPayment } from "@/lib/pos-cash";
import type { Order, OrderItem } from "@/types/database";

interface ThermalReceiptProps {
  order: Order;
  items: OrderItem[];
  merchantName: string;
  /** Override — jika tidak diisi, dibaca dari order.snap_token (POS) */
  cashPayment?: PosCashPayment | null;
}

/** Optimized for 58mm thermal printers */
export function ThermalReceipt({ order, items, merchantName, cashPayment }: ThermalReceiptProps) {
  const cash = cashPayment ?? decodePosCashSnap(order.snap_token ?? null);
  const total =
    cash?.total ??
    Number(order.total_product_amount) + Number(order.delivery_fee);

  return (
    <div
      id="thermal-receipt"
      className="thermal-receipt-sheet mx-auto w-[280px] bg-white p-4 font-mono text-xs text-black"
      data-print-type="thermal"
    >
      <p className="text-center font-bold">WIRA KULINER</p>
      <p className="text-center">{merchantName}</p>
      <p className="text-center text-[10px]">{channelLabel(order.delivery_address)}</p>
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
          <span>{formatIdr(total)}</span>
        </div>
        {cash && (
          <>
            <div className="mt-2 flex justify-between border-t border-dashed border-black pt-2">
              <span>Bayar (tunai)</span>
              <span>{formatIdr(cash.cashPaid)}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>KEMBALIAN</span>
              <span>{formatIdr(cash.change)}</span>
            </div>
          </>
        )}
      </div>
      <p className="mt-4 text-center">Terima kasih!</p>
      <p className="mt-2 text-center text-[8px] text-gray-500" data-powered-by="DAFFACELL">
        powered by DAFFACELL
      </p>
    </div>
  );
}
