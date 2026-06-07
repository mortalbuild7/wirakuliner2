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
  deliveryZoneCenter,
  distanceToZone,
  JALAN_WIRA,
  type ZoneCenter,
} from "@/lib/geo-config";
import { calculateDeliveryFee, describeDeliveryFee } from "@/lib/delivery-fee";
import { formatDineInAddress } from "@/lib/order-channel";
import { isStoreOpen } from "@/lib/merchant-open";
import { formatIdr } from "@/lib/utils";
import { isPaymentBypassEnabled, runCheckoutPayment } from "@/lib/payment-flow";
import type { CartItem } from "@/types/database";
import { CreditCard } from "lucide-react";
import { useSingleMerchantRealtime } from "@/hooks/use-merchant-realtime";

function CheckoutForm() {
  const params = useSearchParams();
  const merchantId = params.get("merchant");
  const dineIn = params.get("mode") === "dine_in";
  const [items, setItems] = useState<CartItem[]>([]);
  const [merchantName, setMerchantName] = useState("");
  const [zoneCenter, setZoneCenter] = useState<ZoneCenter | null>(null);
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState(JALAN_WIRA.latitude);
  const [lng, setLng] = useState(JALAN_WIRA.longitude);
  const [merchantCoordsReady, setMerchantCoordsReady] = useState(false);
  const [distance, setDistance] = useState(0);
  const [gpsAccuracyM, setGpsAccuracyM] = useState<number | null>(null);
  const [bestGpsAccuracyM, setBestGpsAccuracyM] = useState<number | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [storeOpen, setStoreOpen] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null);
      setAuthReady(true);
    });
    if (merchantId) {
      const cart = JSON.parse(
        localStorage.getItem(`wira_cart_${merchantId}`) ?? "[]"
      ) as CartItem[];
      setItems(cart);
      supabase
        .from("merchants")
        .select("name, latitude, longitude, is_open")
        .eq("id", merchantId)
        .single()
        .then(({ data }) => {
          if (data) {
            setMerchantName(data.name);
            const center = deliveryZoneCenter(
              data.latitude,
              data.longitude,
              data.name
            );
            setZoneCenter(center);
            setMerchantCoordsReady(center != null);
            setStoreOpen(isStoreOpen(data));
            if (center && !dineIn) {
              setLat(center.lat);
              setLng(center.lng);
            }
            if (dineIn) {
              setLat(data.latitude);
              setLng(data.longitude);
              setAddress(formatDineInAddress(data.name));
            }
          }
        });
    }
  }, [merchantId, dineIn]);

  useSingleMerchantRealtime(merchantId ?? undefined, (m) => {
    setMerchantName(m.name);
    const center = deliveryZoneCenter(m.latitude, m.longitude, m.name);
    setZoneCenter(center);
    setMerchantCoordsReady(center != null);
    setStoreOpen(isStoreOpen(m));
  });

  useEffect(() => {
    if (dineIn || !zoneCenter) {
      setDistance(0);
      return;
    }
    setDistance(distanceToZone(lat, lng, zoneCenter.lat, zoneCenter.lng));
  }, [lat, lng, dineIn, zoneCenter]);

  const subtotal = items.reduce((s, i) => s + i.product.price * i.quantity, 0);
  const deliveryFee = dineIn ? 0 : calculateDeliveryFee(distance);
  const total = subtotal + deliveryFee;

  function handleLocationChange(newLat: number, newLng: number, accuracyM?: number) {
    setLat(newLat);
    setLng(newLng);
    if (accuracyM != null) {
      setGpsAccuracyM(accuracyM);
      setBestGpsAccuracyM((prev) =>
        prev == null ? accuracyM : Math.min(prev, accuracyM)
      );
      if (!address.trim()) {
        setAddress(`Patokan GPS (akurasi ±${Math.round(accuracyM)} m)`);
      }
    }
  }

  function deliveryAddressForOrder(): string {
    const trimmed = address.trim();
    if (trimmed) return trimmed;
    if (gpsAccuracyM != null) {
      return `GPS ${lat.toFixed(5)}, ${lng.toFixed(5)} (±${Math.round(gpsAccuracyM)} m)`;
    }
    return "";
  }

  const canPlaceDelivery =
    dineIn ||
    (merchantCoordsReady && (Boolean(deliveryAddressForOrder()) || gpsAccuracyM != null));

  async function placeOrder() {
    setPlaceError(null);

    if (!userId || !merchantId) {
      const q = dineIn ? `merchant=${merchantId}&mode=dine_in` : `merchant=${merchantId}`;
      router.push(`/login?redirect=/customer/checkout?${q}`);
      return;
    }

    if (!items.length) {
      setPlaceError("Keranjang kosong. Tambahkan menu terlebih dahulu.");
      return;
    }

    if (!storeOpen) {
      setPlaceError(`${merchantName || "Toko"} sedang tutup. Tidak bisa memesan.`);
      return;
    }

    const deliveryAddr = dineIn
      ? formatDineInAddress(merchantName || "Toko")
      : deliveryAddressForOrder();

    if (!dineIn && !deliveryAddr) {
      setPlaceError("Tunggu GPS atau isi alamat lengkap.");
      return;
    }

    setPlacing(true);

    try {
      const res = await fetch("/api/orders/place-delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          merchantId,
          dineIn,
          items: items.map((i: CartItem) => ({
            productId: i.product.id,
            quantity: i.quantity,
            price: i.product.price,
            name: i.product.name,
          })),
          deliveryAddress: deliveryAddr,
          deliveryLat: lat,
          deliveryLng: lng,
          accuracyM: bestGpsAccuracyM ?? gpsAccuracyM,
          skipPayment: isPaymentBypassEnabled(),
        }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        orderId?: string;
        paid?: boolean;
        needsPayment?: boolean;
      };

      if (!res.ok) {
        setPlaceError(json.error ?? "Gagal membuat pesanan");
        return;
      }

      if (!json.orderId) {
        setPlaceError("Pesanan gagal dibuat. Coba lagi.");
        return;
      }

      localStorage.removeItem(`wira_cart_${merchantId}`);

      if (json.paid) {
        try {
          sessionStorage.setItem(
            `wira_track_${json.orderId}`,
            JSON.stringify({
              id: json.orderId,
              order_status: "paid",
              merchant_id: merchantId,
              delivery_address: deliveryAddr,
            })
          );
        } catch {
          /* ignore */
        }
        router.push(`/customer/orders/${json.orderId}`);
        return;
      }

      if (json.needsPayment) {
        await runCheckoutPayment(json.orderId, total);
        const confirmRes = await fetch("/api/orders/confirm-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ orderId: json.orderId }),
        });
        const confirmJson = (await confirmRes.json().catch(() => ({}))) as { error?: string };
        if (!confirmRes.ok) {
          setPlaceError(confirmJson.error ?? "Gagal mengonfirmasi pembayaran");
          return;
        }
        try {
          sessionStorage.setItem(
            `wira_track_${json.orderId}`,
            JSON.stringify({
              id: json.orderId,
              order_status: "paid",
              merchant_id: merchantId,
              delivery_address: deliveryAddr,
            })
          );
        } catch {
          /* ignore */
        }
        router.push(`/customer/orders/${json.orderId}`);
        return;
      }
    } catch (e) {
      setPlaceError(e instanceof Error ? e.message : "Gagal memproses pesanan");
    } finally {
      setPlacing(false);
    }
  }

  return (
    <main className="space-y-4 px-4 py-4">
      <div>
        <h1 className="text-xl font-bold text-white">
          {dineIn ? "Pesan di tempat" : "Checkout"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {dineIn
            ? "Merchant akan memproses pesanan di kasir"
            : "Tentukan lokasi akurat di peta"}
        </p>
      </div>

      {!storeOpen && (
        <Alert variant="warning" className="border-amber-500/30 bg-amber-500/10">
          <strong>{merchantName || "Toko"} tutup</strong>
          <p className="mt-1 text-xs">Pesanan tidak dapat dilanjutkan.</p>
        </Alert>
      )}

      {dineIn ? (
        <section className="glass-card p-4">
          <p className="text-sm text-muted-foreground">Lokasi</p>
          <p className="mt-1 font-medium text-white">{address || merchantName}</p>
          <p className="mt-2 text-xs text-cyan-300/90">Tanpa ongkir — ambil di toko</p>
        </section>
      ) : !merchantCoordsReady || !zoneCenter ? (
        <section className="glass-card p-4 text-sm text-muted-foreground">
          Memuat lokasi toko...
        </section>
      ) : (
        <section className="glass-card space-y-4 p-4">
          <p className="text-xs text-cyan-300/80">
            Jarak dihitung dari <strong className="text-white">{zoneCenter.name}</strong>
          </p>
          <LocationPicker
            latitude={lat}
            longitude={lng}
            onChange={handleLocationChange}
            distanceKm={distance}
            accuracyM={gpsAccuracyM}
            zoneCenter={zoneCenter}
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
      )}

      <section className="glass-card p-4">
        <p className="text-sm text-muted-foreground">Ringkasan</p>
        <div className="mt-2 space-y-1 text-sm">
          <div className="flex justify-between">
            <span>Produk</span>
            <span>{formatIdr(subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>Ongkir</span>
            <span>{formatIdr(deliveryFee)}</span>
          </div>
          {!dineIn && distance > 0 && (
            <p className="text-[11px] text-muted-foreground">{describeDeliveryFee(distance)}</p>
          )}
          <div className="flex justify-between border-t border-white/10 pt-2 text-base font-bold text-white">
            <span>Total</span>
            <span className="text-cyan-300">{formatIdr(total)}</span>
          </div>
        </div>

        {placeError && (
          <Alert variant="warning" className="mt-4 border-amber-500/30 bg-amber-500/10">
            {placeError}
          </Alert>
        )}

        <Button
          className="mt-4 h-12 w-full rounded-2xl bg-gradient-to-r from-cyan-500 to-orange-500 font-semibold text-slate-950"
          onClick={() => void placeOrder()}
          disabled={
            !authReady ||
            !storeOpen ||
            !items.length ||
            (!dineIn && !canPlaceDelivery) ||
            placing
          }
        >
          {!authReady ? (
            "Memuat akun..."
          ) : placing ? (
            "Memproses pesanan..."
          ) : dineIn ? (
            <>
              <CreditCard className="mr-2 h-4 w-4" /> Bayar & kirim ke dapur
            </>
          ) : isPaymentBypassEnabled() ? (
            <>Bayar (mode uji — tanpa Midtrans)</>
          ) : (
            <>
              <CreditCard className="mr-2 h-4 w-4" /> Bayar (Midtrans)
            </>
          )}
        </Button>
      </section>
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
