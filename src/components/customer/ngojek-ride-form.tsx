"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { formatIdr } from "@/lib/utils";
import { QrisPaymentPanel } from "@/components/payment/qris-payment-panel";
import { PaymentMethodPicker } from "@/components/wallet/payment-method-picker";
import { useNgojekRide } from "@/hooks/use-ngojek-ride";
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
  const ride = useNgojekRide();

  if (!ride.authReady) {
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

      {!ride.userId && (
        <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-100">
          <Link href="/login?next=/customer/ride" className="underline">
            Login
          </Link>{" "}
          untuk memesan NGOJEK
        </Alert>
      )}

      {ride.placeError && (
        <Alert variant="destructive" className="text-sm">
          {ride.placeError}
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
              value={ride.pickupAddress}
              onChange={(e) => ride.setPickupAddress(e.target.value)}
              placeholder="Lokasi jemput"
              className="mt-1 border-white/10 bg-white/5"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 border-emerald-500/40 text-emerald-200"
            onClick={ride.refreshPickupGps}
            disabled={ride.gpsLoading}
          >
            {ride.gpsLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Navigation className="h-4 w-4" />
            )}
          </Button>
        </div>
        {ride.pickupAccuracyM != null && (
          <p className="text-[10px] text-muted-foreground">
            Akurasi GPS ±{Math.round(ride.pickupAccuracyM)} m
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
              value={ride.destAddress}
              onChange={(e) => ride.onDestAddressChange(e.target.value)}
              placeholder="Ketik alamat tujuan..."
              className="mt-1 border-white/10 bg-white/5 pr-9"
            />
            {ride.geocodingDest && (
              <Loader2 className="absolute right-3 top-[2.15rem] h-4 w-4 animate-spin text-cyan-400" />
            )}
            {ride.destSuggestions.length > 0 && (
              <ul className="absolute left-0 right-0 top-full z-40 mt-1 max-h-40 overflow-y-auto rounded-xl border border-white/15 bg-slate-950 shadow-xl">
                {ride.destSuggestions.map((hit) => (
                  <li key={`${hit.lat}-${hit.lng}-${hit.label}`}>
                    <button
                      type="button"
                      className="w-full px-3 py-2.5 text-left text-xs text-white hover:bg-cyan-500/15"
                      onClick={() => ride.applyDestinationHit(hit)}
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
          latitude={ride.destLat}
          longitude={ride.destLng}
          onLocationChange={ride.handleDestMapChange}
          accuracyM={null}
          hubLat={ride.pickupLat}
          hubLng={ride.pickupLng}
          hubLabel="J"
          showRadius={false}
          followGps={false}
          lockZoom={false}
          manualPickMode
          manualPickCenter="both"
          flyToTrigger={ride.mapFlyTrigger}
          height={240}
        />
      </section>

      <section className="glass-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Estimasi jarak</p>
            <p className="text-lg font-semibold text-white">
              {ride.distanceKm.toFixed(2)} km
            </p>
            <p className="text-[10px] text-muted-foreground">{ride.feeDescription}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Tarif NGOJEK</p>
            <p className="text-2xl font-bold text-emerald-300">
              {formatIdr(ride.rideFee)}
            </p>
          </div>
        </div>
      </section>

      {!ride.areaAvailable && ride.areaMessage && (
        <Alert variant="warning" className="border-amber-500/30 bg-amber-500/10">
          {ride.areaMessage}
        </Alert>
      )}

      {ride.userId && (
        <PaymentMethodPicker
          value={ride.paymentMethod}
          onChange={ride.setPaymentMethod}
          walletBalance={ride.walletBalance}
          total={ride.rideFee}
          disabled={ride.placing}
        />
      )}

      <Button
        className="h-12 w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-green-400 text-base font-bold text-slate-950 shadow-lg shadow-emerald-500/25 hover:from-emerald-400 hover:to-green-300"
        disabled={ride.placing || !ride.destAddress.trim() || !ride.areaAvailable}
        onClick={() => void ride.bookRide()}
      >
        {ride.placing ? (
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

      {ride.qrisPayment && (
        <QrisPaymentPanel
          data={ride.qrisPayment}
          title="Scan QRIS — pembayaran NGOJEK"
          onPaid={ride.onQrisPaid}
          onCancel={() => ride.setQrisPayment(null)}
        />
      )}

      {ride.paymentBypass && (
        <p className="text-center text-[10px] text-amber-300/80">
          Mode uji: pembayaran dilewati otomatis
        </p>
      )}
    </div>
  );
}
