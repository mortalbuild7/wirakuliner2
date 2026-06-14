"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { formatIdr } from "@/lib/utils";
import { SERVICE_TYPE_LABEL, type ServiceType } from "@/lib/service-types";
import { QrisPaymentPanel } from "@/components/payment/qris-payment-panel";
import { PaymentMethodPicker } from "@/components/wallet/payment-method-picker";
import { OrderConfirmation } from "@/components/customer/OrderConfirmation";
import { useNgojekRide } from "@/hooks/use-ngojek-ride";
import { cn } from "@/lib/utils";
import { CUSTOMER_GPS_INITIALIZING_MSG } from "@/lib/pickup-coords";
import { isDriverAvailabilityBlockMessage } from "@/lib/customer-order-feedback";
import { LocationSearchBar } from "@/components/maps/LocationSearchBar";
import { PickupMapContainer } from "@/components/maps/PickupMapContainer";
import {
  Bike,
  Car,
  Crosshair,
  Loader2,
  MapPin,
  MapPinned,
  Navigation,
  Package,
  Sparkles,
  Truck,
} from "lucide-react";

const SERVICE_OPTIONS: {
  type: ServiceType;
  icon: typeof Bike;
  iconActive: string;
  iconIdle: string;
  activeRing: string;
  desc: string;
}[] = [
  {
    type: "NGOJEK",
    icon: Bike,
    iconActive: "text-emerald-700",
    iconIdle: "text-slate-700",
    activeRing: "ring-2 ring-emerald-600 bg-emerald-50",
    desc: "Motor — cepat & hemat",
  },
  {
    type: "NGOMOBIL",
    icon: Car,
    iconActive: "text-sky-700",
    iconIdle: "text-slate-700",
    activeRing: "ring-2 ring-sky-600 bg-sky-50",
    desc: "Mobil penumpang",
  },
  {
    type: "PAKET",
    icon: Package,
    iconActive: "text-amber-800",
    iconIdle: "text-slate-700",
    activeRing: "ring-2 ring-amber-600 bg-amber-50",
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
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-600">
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
                "flex flex-col items-center gap-1 rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm transition",
                active
                  ? opt.activeRing
                  : "hover:border-slate-300 hover:bg-slate-50"
              )}
            >
              <Icon
                className={cn("h-6 w-6", active ? opt.iconActive : opt.iconIdle)}
              />
              <span className="text-xs font-bold text-slate-800">{opt.type}</span>
              <span className="text-[9px] font-semibold leading-tight text-slate-600">
                {opt.desc}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Input angka paket — izinkan field kosong saat edit agar tidak jadi "0200" setelah hapus angka.
 * Nilai dikomit ke parent hanya jika parse valid; blur kosong mengembalikan nilai terakhir.
 */
function PackageNumericInput({
  label,
  value,
  onChange,
  integerOnly = false,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  integerOnly?: boolean;
}) {
  const [text, setText] = useState(String(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setText(String(value));
  }, [value]);

  return (
    <div>
      <Label className="text-[10px]">{label}</Label>
      <Input
        type="text"
        inputMode={integerOnly ? "numeric" : "decimal"}
        value={text}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onChange={(e) => {
          const raw = e.target.value;
          if (integerOnly && raw !== "" && !/^\d*$/.test(raw)) return;
          if (!integerOnly && raw !== "" && !/^\d*\.?\d*$/.test(raw)) return;
          setText(raw);
          if (raw === "" || raw === ".") return;
          const n = parseFloat(raw);
          if (Number.isFinite(n)) onChange(n);
        }}
        onBlur={() => {
          focusedRef.current = false;
          const n = parseFloat(text);
          if (text === "" || text === "." || !Number.isFinite(n)) {
            setText(String(value));
            return;
          }
          onChange(n);
          setText(integerOnly ? String(Math.round(n)) : String(n));
        }}
        className="mt-1 border-white/10 bg-white/5"
      />
    </div>
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
        <PackageNumericInput
          label="Berat (kg)"
          value={pkg.weightKg}
          onChange={(n) => ride.updatePackageField("weightKg", n)}
        />
        <PackageNumericInput
          label="Panjang (cm)"
          value={pkg.lengthCm}
          onChange={(n) => ride.updatePackageField("lengthCm", n)}
          integerOnly
        />
        <PackageNumericInput
          label="Lebar (cm)"
          value={pkg.widthCm}
          onChange={(n) => ride.updatePackageField("widthCm", n)}
          integerOnly
        />
        <PackageNumericInput
          label="Tinggi (cm)"
          value={pkg.heightCm}
          onChange={(n) => ride.updatePackageField("heightCm", n)}
          integerOnly
        />
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
              <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-700">
                <Sparkles className="h-3 w-3" /> WIRA Ride
              </p>
              <h1 className="text-2xl font-black tracking-tight text-slate-900">
                Transportasi & Kirim
              </h1>
              <p className="mt-1 text-xs font-medium text-slate-600">
                NGOJEK · NGOMOBIL · PAKET — dalam satu aplikasi
              </p>
            </div>
          </div>
        </section>
      )}

      {embedded && (
        <section className="glass-card border-emerald-200 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">
            WIRA Ride
          </p>
          <p className="mt-1 text-sm font-medium text-slate-600">
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

      {ride.placeError && !isDriverAvailabilityBlockMessage(ride.placeError) && (
        <Alert variant="destructive" className="text-sm">
          {ride.placeError}
        </Alert>
      )}

      {ride.showFlexiblePickup ? (
        <section className="glass-card relative space-y-3 p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
              <MapPinned className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs font-bold text-emerald-800">Titik jemput</p>
              <p className="text-[10px] font-medium text-slate-600">
                Pesan untuk orang lain? Geser peta atau cari alamat manual.
              </p>
            </div>
          </div>

          <LocationSearchBar
            label="Alamat jemput"
            value={ride.pickupAddress}
            onChange={ride.onPickupAddressChange}
            onSelect={ride.handlePickupSearchSelect}
            placeholder="Contoh: Bandara Soekarno-Hatta, Mall Parung…"
            nearLat={ride.pickupLat}
            nearLng={ride.pickupLng}
            accentClass="text-emerald-800"
          />

          <PickupMapContainer
            centerLat={ride.pickupLat}
            centerLng={ride.pickupLng}
            hubLat={ride.pickupLat}
            hubLng={ride.pickupLng}
            panTrigger={ride.pickupMapFlyTrigger}
            onMapIdle={ride.handlePickupMapIdle}
            height={220}
          />

          <p className="text-[10px] text-muted-foreground">
            Geser peta — pin hijau tetap di tengah; alamat diperbarui otomatis.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-emerald-300 text-emerald-800 hover:bg-emerald-50"
              onClick={ride.applyPickupFromDevice}
              disabled={ride.gpsLoading || !ride.currentDeviceLocation}
            >
              <Crosshair className="mr-1 h-3.5 w-3.5" />
              Gunakan lokasi saya
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-slate-200 text-slate-700 hover:bg-slate-50"
              onClick={ride.refreshPickupGps}
              disabled={ride.gpsLoading}
            >
              {ride.gpsLoading ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Navigation className="mr-1 h-3.5 w-3.5" />
              )}
              Refresh GPS
            </Button>
          </div>
          {ride.gpsInitStatus === "INITIALIZING_GPS" && (
            <p className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
              {ride.gpsLoading ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
              ) : (
                <Navigation className="h-3.5 w-3.5 shrink-0 opacity-70" />
              )}
              {CUSTOMER_GPS_INITIALIZING_MSG}
            </p>
          )}
          {ride.currentDeviceLocation && ride.pickupAccuracyM != null && (
            <p className="text-[10px] font-medium text-slate-600">
              GPS perangkat: {ride.currentDeviceLocation.address} (±
              {Math.round(ride.pickupAccuracyM)} m)
            </p>
          )}
        </section>
      ) : (
        <section className="glass-card space-y-4 p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
              <Crosshair className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <Label className="text-xs font-bold text-emerald-800">Titik jemput paket</Label>
              <Input
                value={ride.pickupAddress}
                onChange={(e) => ride.onPickupAddressChange(e.target.value)}
                placeholder="Lokasi pengambilan paket"
                className="mt-1 border-slate-200 bg-white text-slate-900"
              />
            </div>
          </div>
        </section>
      )}

      <section className="glass-card relative z-0 isolate overflow-hidden space-y-3 p-4">
        <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 text-sky-800">
            <MapPin className="h-4 w-4" />
          </span>
          <div className="relative flex-1">
            {ride.showFlexiblePickup ? (
              <LocationSearchBar
                label={ride.serviceType === "PAKET" ? "Alamat penerima" : "Tujuan"}
                value={ride.destAddress}
                onChange={ride.onDestAddressChange}
                onSelect={ride.handleDestinationSearchSelect}
                placeholder="Ketik alamat tujuan..."
                nearLat={ride.pickupLat}
                nearLng={ride.pickupLng}
                accentClass="text-sky-800"
              />
            ) : (
              <>
                <Label className="text-xs font-semibold text-sky-800">Alamat penerima</Label>
                <Input
                  value={ride.destAddress}
                  onChange={(e) => ride.onDestAddressChange(e.target.value)}
                  placeholder="Alamat pengantaran paket..."
                  className="mt-1 border-slate-200 bg-white pr-9 text-slate-900 placeholder:text-slate-400"
                />
                {ride.geocodingDest && (
                  <Loader2 className="absolute right-3 top-[2.15rem] h-4 w-4 animate-spin text-sky-600" />
                )}
                {ride.destSuggestions.length > 0 && (
                  <ul className="mt-1 max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-md">
                    {ride.destSuggestions.map((hit) => (
                      <li key={`${hit.lat}-${hit.lng}-${hit.label}`}>
                        <button
                          type="button"
                          className="w-full border-b border-slate-100 px-3 py-2.5 text-left text-xs text-slate-800 last:border-b-0 hover:bg-sky-50"
                          onClick={() => ride.applyDestinationHit(hit)}
                        >
                          {hit.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          {ride.showFlexiblePickup
            ? "Pilih dari daftar alamat. (Peta tujuan — fase berikutnya)"
            : "Ketik alamat tujuan di kolom di atas."}
        </p>
        <div className="flex h-[120px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-center text-xs text-slate-500">
          Peta tujuan dinonaktifkan sementara — rebuild bertahap
        </div>
      </section>

      {ride.serviceType === "PAKET" && <PaketDetailsForm ride={ride} />}

      <section className="glass-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-600">Estimasi jarak</p>
            <p className="text-lg font-bold text-slate-900">
              {ride.distanceKm.toFixed(2)} km
            </p>
            <p className="text-[10px] font-medium text-slate-600">
              {ride.quoting ? "Memperbarui tarif…" : ride.feeDescription}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold text-slate-600">Tarif {ride.serviceType}</p>
            <p className="flex items-center justify-end gap-2 text-2xl font-bold text-emerald-700">
              {formatIdr(ride.rideFee)}
              {ride.quoting && (
                <Loader2 className="h-5 w-5 shrink-0 animate-spin opacity-70" />
              )}
            </p>
          </div>
        </div>
      </section>

      {ride.userId && (
        <PaymentMethodPicker
          value={ride.paymentMethod}
          onChange={ride.setPaymentMethod}
          walletBalance={ride.walletBalance}
          total={ride.rideFee}
          disabled={ride.placing}
        />
      )}

      <OrderConfirmation ride={ride} />

      {ride.qrisPayment && (
        <QrisPaymentPanel
          data={ride.qrisPayment}
          title={`Scan QRIS — pembayaran ${ride.serviceType}`}
          onPaid={ride.onQrisPaid}
          onCancel={() => ride.setQrisPayment(null)}
        />
      )}

      {ride.paymentBypass && (
        <p className="text-center text-[10px] font-medium text-amber-800">
          Mode uji: pembayaran dilewati otomatis
        </p>
      )}
    </div>
  );
}
