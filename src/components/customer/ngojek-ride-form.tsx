"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeocodeHit } from "@/lib/geocode";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { haversineKm, JALAN_WIRA } from "@/lib/geo-config";
import { calculateDeliveryFee, describeDeliveryFee } from "@/lib/delivery-fee";
import { formatIdr } from "@/lib/utils";
import { isPaymentBypassEnabled, runCheckoutPayment } from "@/lib/payment-flow";
import { useMapLocation } from "@/hooks/use-map-location";
import {
  Bike,
  Crosshair,
  Loader2,
  MapPin,
  Navigation,
  Sparkles,
} from "lucide-react";

const DestinationMap = dynamic(
  () =>
    import("@/components/maps/location-map-inner").then((m) => m.LocationMapInner),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[240px] items-center justify-center rounded-2xl bg-emerald-950/60 text-sm text-emerald-200/80">
        Memuat peta...
      </div>
    ),
  }
);

export function NgojekRideForm({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const supabase = createClient();

  const [authReady, setAuthReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [pickupAddress, setPickupAddress] = useState("Lokasi saya");
  const [pickupLat, setPickupLat] = useState(JALAN_WIRA.latitude);
  const [pickupLng, setPickupLng] = useState(JALAN_WIRA.longitude);
  const [pickupAccuracyM, setPickupAccuracyM] = useState<number | null>(null);

  const [destAddress, setDestAddress] = useState("");
  const [destLat, setDestLat] = useState(JALAN_WIRA.latitude + 0.01);
  const [destLng, setDestLng] = useState(JALAN_WIRA.longitude + 0.01);

  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [destSuggestions, setDestSuggestions] = useState<GeocodeHit[]>([]);
  const [geocodingDest, setGeocodingDest] = useState(false);
  const [mapFlyTrigger, setMapFlyTrigger] = useState(0);

  const skipForwardGeocodeRef = useRef(false);
  const reverseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { fix: gpsFix, loading: gpsLoading } = useMapLocation(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null);
      setAuthReady(true);
    });
  }, [supabase]);

  useEffect(() => {
    if (!gpsFix) return;
    setPickupLat(gpsFix.lat);
    setPickupLng(gpsFix.lng);
    setPickupAccuracyM(gpsFix.accuracy);
  }, [gpsFix?.lat, gpsFix?.lng, gpsFix?.accuracy]);

  const distanceKm = useMemo(
    () => haversineKm(pickupLat, pickupLng, destLat, destLng),
    [pickupLat, pickupLng, destLat, destLng]
  );

  const rideFee = useMemo(() => calculateDeliveryFee(distanceKm), [distanceKm]);

  const applyDestinationCoords = useCallback((lat: number, lng: number, fly = true) => {
    setDestLat(lat);
    setDestLng(lng);
    if (fly) setMapFlyTrigger((n) => n + 1);
  }, []);

  const applyDestinationHit = useCallback(
    (hit: GeocodeHit) => {
      skipForwardGeocodeRef.current = true;
      setDestAddress(hit.label);
      applyDestinationCoords(hit.lat, hit.lng);
      setDestSuggestions([]);
    },
    [applyDestinationCoords]
  );

  const reverseGeocodeDest = useCallback(async (lat: number, lng: number) => {
    try {
      const params = new URLSearchParams({
        reverse: "1",
        lat: String(lat),
        lng: String(lng),
      });
      const res = await fetch(`/api/geocode?${params.toString()}`);
      const json = (await res.json().catch(() => ({}))) as { results?: GeocodeHit[] };
      const hit = json.results?.[0];
      if (hit) {
        skipForwardGeocodeRef.current = true;
        setDestAddress(hit.label);
      }
    } catch {
      /* abaikan */
    }
  }, []);

  useEffect(() => {
    if (skipForwardGeocodeRef.current) {
      skipForwardGeocodeRef.current = false;
      return;
    }

    const q = destAddress.trim();
    if (q.length < 3) {
      setDestSuggestions([]);
      return;
    }

    const timer = setTimeout(() => {
      void (async () => {
        setGeocodingDest(true);
        setPlaceError(null);
        try {
          const params = new URLSearchParams({ q });
          params.set("nearLat", String(pickupLat));
          params.set("nearLng", String(pickupLng));
          const res = await fetch(`/api/geocode?${params.toString()}`);
          const json = (await res.json().catch(() => ({}))) as {
            error?: string;
            results?: GeocodeHit[];
          };
          if (!res.ok) {
            if (json.error) setPlaceError(json.error);
            setDestSuggestions([]);
            return;
          }
          const results = json.results ?? [];
          if (results.length === 0) {
            setDestSuggestions([]);
            setPlaceError("Alamat tidak ditemukan — coba kata kunci lain atau geser pin");
            return;
          }
          applyDestinationCoords(results[0].lat, results[0].lng);
          setDestSuggestions(results.length > 1 ? results : []);
        } catch {
          setPlaceError("Gagal mencari alamat. Periksa koneksi internet.");
        } finally {
          setGeocodingDest(false);
        }
      })();
    }, 750);

    return () => clearTimeout(timer);
  }, [destAddress, pickupLat, pickupLng, applyDestinationCoords]);

  const handleDestMapChange = useCallback(
    (lat: number, lng: number) => {
      applyDestinationCoords(lat, lng, false);
      setDestSuggestions([]);
      if (reverseTimerRef.current) clearTimeout(reverseTimerRef.current);
      reverseTimerRef.current = setTimeout(() => {
        void reverseGeocodeDest(lat, lng);
      }, 500);
    },
    [applyDestinationCoords, reverseGeocodeDest]
  );

  useEffect(() => {
    return () => {
      if (reverseTimerRef.current) clearTimeout(reverseTimerRef.current);
    };
  }, []);

  const refreshPickupGps = useCallback(() => {
    if (!navigator.geolocation) {
      setPlaceError("GPS tidak tersedia di perangkat ini");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPickupLat(pos.coords.latitude);
        setPickupLng(pos.coords.longitude);
        setPickupAccuracyM(pos.coords.accuracy);
        setPlaceError(null);
      },
      () => setPlaceError("Gagal mengambil lokasi GPS. Izinkan akses lokasi."),
      { enableHighAccuracy: true, timeout: 15_000 }
    );
  }, []);

  async function bookRide() {
    if (!userId) {
      router.push(`/login?next=${encodeURIComponent("/customer/ride")}`);
      return;
    }
    if (!destAddress.trim()) {
      setPlaceError("Isi alamat tujuan");
      return;
    }
    if (distanceKm < 0.05) {
      setPlaceError("Titik jemput dan tujuan terlalu dekat");
      return;
    }

    setPlacing(true);
    setPlaceError(null);

    try {
      const res = await fetch("/api/orders/place-ride", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          pickupAddress: pickupAddress.trim() || "Lokasi jemput",
          destinationAddress: destAddress.trim(),
          pickupLat,
          pickupLng,
          destinationLat: destLat,
          destinationLng: destLng,
          skipPayment: isPaymentBypassEnabled(),
        }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        orderId?: string;
        paid?: boolean;
        needsPayment?: boolean;
        rideFee?: number;
      };

      if (!res.ok) {
        setPlaceError(json.error ?? "Gagal memesan NGOJEK");
        return;
      }

      const orderId = json.orderId;
      if (!orderId) {
        setPlaceError("Respons order tidak valid");
        return;
      }

      if (json.paid) {
        router.push(`/customer/orders/${orderId}`);
        return;
      }

      if (json.needsPayment) {
        await runCheckoutPayment(orderId, json.rideFee ?? rideFee);
        router.push(`/customer/orders/${orderId}`);
      }
    } catch {
      setPlaceError("Koneksi gagal. Coba lagi.");
    } finally {
      setPlacing(false);
    }
  }

  if (!authReady) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Memuat...
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-6">
      {!embedded && (
        <section className="overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-600/30 via-emerald-950/40 to-slate-950 p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 shadow-lg shadow-emerald-500/30">
              <Bike className="h-6 w-6 text-slate-950" />
            </span>
            <div>
              <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300">
                <Sparkles className="h-3 w-3" /> WIRA Ride
              </p>
              <h1 className="text-2xl font-black tracking-tight text-white">NGOJEK</h1>
              <p className="mt-1 text-xs text-emerald-100/80">
                Ojek online — jemput di lokasi Anda, antar ke tujuan
              </p>
            </div>
          </div>
        </section>
      )}

      {embedded && (
        <section className="glass-card border-emerald-500/20 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-emerald-300">
            Ojek online WIRA
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Jemput di lokasi Anda, antar ke tujuan
          </p>
        </section>
      )}

      {!userId && (
        <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-100">
          <Link href={`/login?next=${encodeURIComponent("/customer/ride")}`} className="underline">
            Login
          </Link>{" "}
          untuk memesan NGOJEK
        </Alert>
      )}

      {placeError && (
        <Alert variant="destructive" className="text-sm">
          {placeError}
        </Alert>
      )}

      <section className="glass-card space-y-4 p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
            <Crosshair className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <Label className="text-xs text-emerald-300">Titik jemput</Label>
            <Input
              value={pickupAddress}
              onChange={(e) => setPickupAddress(e.target.value)}
              placeholder="Lokasi jemput"
              className="mt-1 border-white/10 bg-white/5"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 border-emerald-500/40 text-emerald-200"
            onClick={refreshPickupGps}
            disabled={gpsLoading}
          >
            {gpsLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Navigation className="h-4 w-4" />
            )}
          </Button>
        </div>
        {pickupAccuracyM != null && (
          <p className="text-[10px] text-muted-foreground">
            Akurasi GPS ±{Math.round(pickupAccuracyM)} m
          </p>
        )}
      </section>

      <section className="glass-card space-y-3 p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-300">
            <MapPin className="h-4 w-4" />
          </span>
          <div className="relative flex-1">
            <Label className="text-xs text-cyan-300">Tujuan</Label>
            <Input
              value={destAddress}
              onChange={(e) => {
                setPlaceError(null);
                setDestAddress(e.target.value);
              }}
              placeholder="Ketik alamat tujuan..."
              className="mt-1 border-white/10 bg-white/5 pr-9"
            />
            {geocodingDest && (
              <Loader2 className="absolute right-3 top-[2.15rem] h-4 w-4 animate-spin text-cyan-400" />
            )}
            {destSuggestions.length > 0 && (
              <ul className="absolute left-0 right-0 top-full z-40 mt-1 max-h-40 overflow-y-auto rounded-xl border border-white/15 bg-slate-950 shadow-xl">
                {destSuggestions.map((hit) => (
                  <li key={`${hit.lat}-${hit.lng}-${hit.label}`}>
                    <button
                      type="button"
                      className="w-full px-3 py-2.5 text-left text-xs text-white hover:bg-cyan-500/15"
                      onClick={() => applyDestinationHit(hit)}
                    >
                      {hit.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Ketik alamat — pin biru mengikuti. Atau geser pin / ketuk peta.
        </p>
        <DestinationMap
          latitude={destLat}
          longitude={destLng}
          onLocationChange={handleDestMapChange}
          accuracyM={null}
          hubLat={pickupLat}
          hubLng={pickupLng}
          hubLabel="J"
          showRadius={false}
          followGps={false}
          lockZoom={false}
          manualPickMode
          manualPickCenter="both"
          flyToTrigger={mapFlyTrigger}
          height={240}
        />
      </section>

      <section className="glass-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Estimasi jarak</p>
            <p className="text-lg font-semibold text-white">{distanceKm.toFixed(2)} km</p>
            <p className="text-[10px] text-muted-foreground">{describeDeliveryFee(distanceKm)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Tarif NGOJEK</p>
            <p className="text-2xl font-bold text-emerald-300">{formatIdr(rideFee)}</p>
          </div>
        </div>
      </section>

      <Button
        className="h-12 w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-green-400 text-base font-bold text-slate-950 shadow-lg shadow-emerald-500/25 hover:from-emerald-400 hover:to-green-300"
        disabled={placing || !destAddress.trim()}
        onClick={() => void bookRide()}
      >
        {placing ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Memesan...
          </>
        ) : (
          <>
            <Bike className="mr-2 h-5 w-5" />
            Pesan NGOJEK
          </>
        )}
      </Button>

      {isPaymentBypassEnabled() && (
        <p className="text-center text-[10px] text-amber-300/80">
          Mode uji: pembayaran dilewati otomatis
        </p>
      )}
    </div>
  );
}
