"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { LocationPicker } from "@/components/maps/location-picker";
import {
  FLAT_DELIVERY_FEE_IDR,
  haversineKm,
  isWithinRadius,
  JALAN_WIRA,
} from "@/lib/geo-config";
import { formatIdr } from "@/lib/utils";
import { createPaymentSnapToken, openMidtransSnap } from "@/lib/payment-stub";
import { NegotiationChat } from "@/components/customer/negotiation-chat";
import type { CartItem } from "@/types/database";
import { CreditCard, MessageCircle } from "lucide-react";

function CheckoutForm() {
  const params = useSearchParams();
  const merchantId = params.get("merchant");
  const [items, setItems] = useState<CartItem[]>([]);
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState(JALAN_WIRA.latitude + 0.001);
  const [lng, setLng] = useState(JALAN_WIRA.longitude + 0.001);
  const [distance, setDistance] = useState(0);
  const [outside, setOutside] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null));
    if (merchantId) {
      const cart = JSON.parse(
        localStorage.getItem(`wira_cart_${merchantId}`) ?? "[]"
      ) as CartItem[];
      setItems(cart);
    }
  }, [merchantId]);

  useEffect(() => {
    const d = haversineKm(JALAN_WIRA.latitude, JALAN_WIRA.longitude, lat, lng);
    setDistance(d);
    setOutside(!isWithinRadius(lat, lng));
  }, [lat, lng]);

  const subtotal = items.reduce((s, i) => s + i.product.price * i.quantity, 0);
  const deliveryFee = outside ? 0 : FLAT_DELIVERY_FEE_IDR;
  const total = subtotal + deliveryFee;

  function handleLocationChange(newLat: number, newLng: number) {
    setLat(newLat);
    setLng(newLng);
  }

  async function placeOrder() {
    if (!userId || !merchantId) {
      alert("Silakan login sebagai customer");
      router.push(`/login?redirect=/customer/checkout?merchant=${merchantId}`);
      return;
    }

    const { data: order, error } = await supabase
      .from("orders")
      .insert({
        customer_id: userId,
        merchant_id: merchantId,
        total_product_amount: subtotal,
        delivery_fee: deliveryFee,
        is_outside_radius: outside,
        negotiation_status: outside ? "negotiating" : "none",
        order_status: "pending_payment",
        delivery_address: address,
        delivery_lat: lat,
        delivery_lng: lng,
        distance_km: distance,
      })
      .select()
      .single();

    if (error || !order) {
      alert(error?.message ?? "Gagal membuat pesanan");
      return;
    }

    for (const item of items) {
      await supabase.from("order_items").insert({
        order_id: order.id,
        product_id: item.product.id,
        quantity: item.quantity,
        price: item.product.price,
        product_name: item.product.name,
      });
    }

    setOrderId(order.id);
    localStorage.removeItem(`wira_cart_${merchantId}`);

    if (outside) {
      const { data: drivers } = await supabase
        .from("drivers")
        .select("id")
        .eq("status", "idle")
        .limit(1);
      if (drivers?.[0]) {
        await supabase.from("negotiations").insert({
          order_id: order.id,
          driver_id: drivers[0].id,
          proposed_fee: 25000,
          status: "pending",
        });
      }
      await fetch("/api/fcm/driver-notify", {
        method: "POST",
        body: JSON.stringify({
          record: {
            id: order.id,
            is_outside_radius: true,
            negotiation_status: "negotiating",
            delivery_address: address,
          },
        }),
      });
      return;
    }

    const token = await createPaymentSnapToken(order.id, total);
    openMidtransSnap(token);
    await supabase.from("orders").update({ order_status: "paid" }).eq("id", order.id);
    router.push(`/customer/orders/${order.id}`);
  }

  return (
    <main className="space-y-4 px-4 py-4">
      <div>
        <h1 className="text-xl font-bold text-white">Checkout</h1>
        <p className="text-sm text-muted-foreground">Tentukan lokasi akurat di peta</p>
      </div>

      <section className="glass-card space-y-4 p-4">
        <LocationPicker
          latitude={lat}
          longitude={lng}
          onChange={handleLocationChange}
          distanceKm={distance}
          withinRadius={!outside}
        />

        <div>
          <Label className="text-muted-foreground">Alamat lengkap</Label>
          <Input
            className="mt-1.5 rounded-xl border-white/10 bg-white/5"
            placeholder="No rumah, patokan, dll."
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>
      </section>

      <section className="glass-card p-4">
        <p className="text-sm text-muted-foreground">Ringkasan</p>
        <div className="mt-2 space-y-1 text-sm">
          <div className="flex justify-between">
            <span>Produk</span>
            <span>{formatIdr(subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>Ongkir</span>
            <span>{outside ? "Nego" : formatIdr(deliveryFee)}</span>
          </div>
          <div className="flex justify-between border-t border-white/10 pt-2 text-base font-bold text-white">
            <span>Total</span>
            <span className="text-cyan-300">{formatIdr(total)}</span>
          </div>
        </div>

        {outside && !orderId && (
          <Alert variant="warning" className="mt-4 border-amber-500/30 bg-amber-500/10">
            <strong className="flex items-center gap-1">
              <MessageCircle className="h-4 w-4" /> Luar radius
            </strong>
            <p className="mt-1 text-xs">Nego tarif dengan driver via chat sebelum bayar.</p>
          </Alert>
        )}

        {!orderId && (
          <Button
            className="mt-4 h-12 w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-orange-500 font-semibold text-slate-950"
            onClick={placeOrder}
            disabled={!address.trim()}
          >
            {outside ? (
              <>Mulai nego driver</>
            ) : (
              <>
                <CreditCard className="mr-2 h-4 w-4" /> Bayar (Midtrans)
              </>
            )}
          </Button>
        )}
      </section>

      {orderId && outside && userId && (
        <section className="glass-card overflow-hidden p-2">
          <NegotiationChat orderId={orderId} userId={userId} />
        </section>
      )}
    </main>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense
      fallback={
        <p className="p-4 text-center text-muted-foreground">Memuat checkout...</p>
      }
    >
      <CheckoutForm />
    </Suspense>
  );
}
