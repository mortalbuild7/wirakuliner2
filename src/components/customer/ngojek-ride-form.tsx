"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { formatIdr } from "@/lib/utils";
import { SERVICE_TYPE_LABEL, type ServiceType } from "@/lib/service-types";
import { QrisPaymentPanel } from "@/components/payment/qris-payment-panel";
import { PaymentMethodPicker } from "@/components/wallet/payment-method-picker";
import { useNgojekRide } from "@/hooks/use-ngojek-ride";
import { cn } from "@/lib/utils";
import {
  Bike,
  Car,
  Crosshair,
  Loader2,
  MapPin,
  Navigation,
  Package,
  Sparkles,
  Truck,
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

const SERVICE_OPTIONS: {
  type: ServiceType;
  icon: typeof Bike;
  color: string;
  activeBg: string;
  desc: string;
}[] = [
  {
    type: "NGOJEK",
    icon: Bike,
    color: "text-emerald-300",
    activeBg: "from-emerald-500/30 to-emerald-950/40 border-emerald-500/50",
    desc: "Motor — cepat & hemat",
  },
  {
    type: "NGOMOBIL",
    icon: Car,
    color: "text-sky-300",
    activeBg: "from-sky-500/30 to-sky-950/40 border-sky-500/50",
    desc: "Mobil penumpang",
  },
  {
    type: "PAKET",
    icon: Package,
    color: "text-amber-300",
    activeBg: "from-amber-500/30 to-amber-950/40 border-amber-500/50",
    desc: "Kirim barang",
  },
];

const PACKAGE_TYPES = ["Dokumen", "Makanan", "Pakaian", "Elektronik", "Lainnya"];

function ServicePicker({
  value,
  onChange,
}: {
  value: ServiceType;
  onChange: (t: ServiceType) => void;
}) {
  return (
    <section className="glass-card p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Pilih layanan
      </p>
      <div className="grid grid-cols-3 gap-2">
        {SERVICE_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = value === opt.type;
          return (
            <button
              key={opt.type}
              type="button"
              onClick={() => onChange(opt.type)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border p-3 text-center transition",
                active
                  ? `bg-gradient-to-b ${opt.activeBg} shadow-md`
                  : "border-white/10 bg-white/5 hover:bg-white/10"
              )}
            >
              <Icon className={cn("h-6 w-6", active ? opt.color : "text-muted-foreground")} />
              <span className={cn("text-xs font-bold", active ? "text-white" : "text-muted-foreground")}>
                {opt.type}
              </span>
              <span className="text-[9px] leading-tight text-muted-foreground">{opt.desc}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function PaketDetailsForm({
  ride,
}: {
  ride: ReturnType<typeof useNgojekRide>;
}) {
  const pkg = ride.packageDetails;

  return (
    <section className="glass-card space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Package className="h-5 w-5 text-amber-300" />
        <div>
          <p className="text-sm font-semibold text-white">Detail paket</p>
          <p className="text-[10px] text-muted-foreground">
            Data pengirim, penerima, dan dimensi barang
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-white/10 p-3">
          <p className="text-xs font-medium text-amber-200">Pengirim</p>
          <div>
            <Label className="text-[10px]">Nama</Label>
            <Input
              value={pkg.senderName}
              onChange={(e) => ride.updatePackageField("senderName", e.target.value)}
              placeholder="Nama pengirim"
              className="mt-1 border-white/10 bg-white/5"
            />
          </div>
          <div>
            <Label className="text-[10px]">No. HP</Label>
            <Input
              value={pkg.senderPhone}
              onChange={(e) => ride.updatePackageField("senderPhone", e.target.value)}
              placeholder="08xxxxxxxxxx"
              inputMode="tel"
              className="mt-1 border-white/10 bg-white/5"
            />
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-white/10 p-3">
          <p className="text-xs font-medium text-cyan-200">Penerima</p>
          <div>
            <Label className="text-[10px]">Nama</Label>
            <Input
              value={pkg.recipientName}
              onChange={(e) => ride.updatePackageField("recipientName", e.target.value)}
              placeholder="Nama penerima"
              className="mt-1 border-white/10 bg-white/5"
            />
          </div>
          <div>
            <Label className="text-[10px]">No. HP</Label>
            <Input
              value={pkg.recipientPhone}
              onChange={(e) => ride.updatePackageField("recipientPhone", e.target.value)}
              placeholder="08xxxxxxxxxx"
              inputMode="tel"
              className="mt-1 border-white/10 bg-white/5"
            />
          </div>
        </div>
      </div>

      <div>
        <Label className="text-xs text-muted-foreground">Jenis barang</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {PACKAGE_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => ride.updatePackageField("packageType", t)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition",
                pkg.packageType === t
                  ? "border-amber-500/60 bg-amber-500/20 text-amber-100"
                  : "border-white/15 text-muted-foreground hover:bg-white/5"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <Label className="text-[10px]">Berat (kg)</Label>
          <Input
            type="number"
            min={0.1}
            step={0.1}
            value={pkg.weightKg}
            onChange={(e) =>
              ride.updatePackageField("weightKg", Number(e.target.value) || 0)
            }
            className="mt-1 border-white/10 bg-white/5"
          />
        </div>
        <div>
          <Label className="text-[10px]">Panjang (cm)</Label>
          <Input
            type="number"
            min={1}
            value={pkg.lengthCm}
            onChange={(e) =>
              ride.updatePackageField("lengthCm", Number(e.target.value) || 0)
            }
            className="mt-1 border-white/10 bg-white/5"
          />
        </div>
        <div>
          <Label className="text-[10px]">Lebar (cm)</Label>
          <Input
            type="number"
            min={1}
            value={pkg.widthCm}
            onChange={(e) =>
              ride.updatePackageField("widthCm", Number(e.target.value) || 0)
            }
            className="mt-1 border-white/10 bg-white/5"
          />
        </div>
        <div>
          <Label className="text-[10px]">Tinggi (cm)</Label>
          <Input
            type="number"
            min={1}
            value={pkg.heightCm}
            onChange={(e) =>
              ride.updatePackageField("heightCm", Number(e.target.value) || 0)
            }
            className="mt-1 border-white/10 bg-white/5"
          />
        </div>
      </div>

      <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs">
        <p className="text-muted-foreground">
          Volume:{" "}
          <span className="font-medium text-white">
            {ride.packageVolume.toLocaleString("id-ID")} cm³
          </span>
        </p>
        {ride.needsCargoVehicle ? (
          <p className="mt-1 flex items-center gap-1 text-amber-300">
            <Truck className="h-3.5 w-3.5" />
            Paket besar — akan dialokasikan ke mobil box/pickup
          </p>
        ) : (
          <p className="mt-1 text-emerald-300/90">
            Ukuran standar — dialokasikan ke motor
          </p>
        )}
      </div>
    </section>
  );
}

export function NgojekRideForm({ embedded = false }: { embedded?: boolean }) {
  const ride = useNgojekRide();
  const bookLabel =
    ride.serviceType === "PAKET"
      ? "Kirim PAKET"
      : ride.serviceType === "NGOMOBIL"
        ? "Pesan NGOMOBIL"
        : "Pesan NGOJEK";

  const BookIcon =
    ride.serviceType === "PAKET"
      ? Package
      : ride.serviceType === "NGOMOBIL"
        ? Car
        : Bike;

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
              <h1 className="text-2xl font-black tracking-tight text-white">
                Transportasi & Kirim
              </h1>
              <p className="mt-1 text-xs text-emerald-100/80">
                NGOJEK · NGOMOBIL · PAKET — dalam satu aplikasi
              </p>
            </div>
          </div>
        </section>
      )}

      {embedded && (
        <section className="glass-card border-emerald-500/20 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-emerald-300">
            WIRA Ride
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            NGOJEK, NGOMOBIL, dan kirim paket
          </p>
        </section>
      )}

      <ServicePicker value={ride.serviceType} onChange={ride.setServiceType} />

      {!ride.userId && (
        <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-100">
          <Link href="/login?next=/customer/ride" className="underline">
            Login
          </Link>{" "}
          untuk memesan {SERVICE_TYPE_LABEL[ride.serviceType]}
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
            <Label className="text-xs text-cyan-300">
              {ride.serviceType === "PAKET" ? "Alamat penerima" : "Tujuan"}
            </Label>
            <Input
              value={ride.destAddress}
              onChange={(e) => ride.onDestAddressChange(e.target.value)}
              placeholder={
                ride.serviceType === "PAKET"
                  ? "Alamat pengantaran paket..."
                  : "Ketik alamat tujuan..."
              }
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

      {ride.serviceType === "PAKET" && <PaketDetailsForm ride={ride} />}

      <section className="glass-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Estimasi jarak</p>
            <p className="text-lg font-semibold text-white">
              {ride.distanceKm.toFixed(2)} km
            </p>
            <p className="text-[10px] text-muted-foreground">
              {ride.quoting ? "Menghitung tarif..." : ride.feeDescription}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Tarif {ride.serviceType}</p>
            <p className="text-2xl font-bold text-emerald-300">
              {ride.quoting ? (
                <Loader2 className="inline h-6 w-6 animate-spin" />
              ) : (
                formatIdr(ride.rideFee)
              )}
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
        disabled={
          ride.placing ||
          !ride.destAddress.trim() ||
          !ride.areaAvailable ||
          ride.quoting
        }
        onClick={() => void ride.bookRide()}
      >
        {ride.placing ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Memesan...
          </>
        ) : (
          <>
            <BookIcon className="mr-2 h-5 w-5" />
            {bookLabel}
          </>
        )}
      </Button>

      {ride.qrisPayment && (
        <QrisPaymentPanel
          data={ride.qrisPayment}
          title={`Scan QRIS — pembayaran ${ride.serviceType}`}
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
