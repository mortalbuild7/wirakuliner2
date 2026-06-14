"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LocationSearchBar } from "@/components/maps/LocationSearchBar";
import { RideMapContainer } from "@/components/maps/RideMapContainer";
import type { BookingStep } from "@/components/maps/ride-map-inner";
import { OrderConfirmation } from "@/components/customer/OrderConfirmation";
import { PaymentMethodPicker } from "@/components/wallet/payment-method-picker";
import type { useNgojekRide } from "@/hooks/use-ngojek-ride";
import { CUSTOMER_GPS_INITIALIZING_MSG } from "@/lib/pickup-coords";
import { formatIdr, cn } from "@/lib/utils";
import {
  ArrowLeft,
  Check,
  Crosshair,
  Loader2,
  Lock,
  MapPin,
  MapPinned,
  Navigation,
} from "lucide-react";

export type { BookingStep };

type RideHook = ReturnType<typeof useNgojekRide>;

const PICKUP_PLACEHOLDER = "Pilih lokasi jemput di peta";
const DEST_PLACEHOLDER = "Pilih titik tujuan di peta";

function StepIndicator({
  bookingStep,
  destLabel,
}: {
  bookingStep: BookingStep;
  destLabel: string;
}) {
  const steps: { key: BookingStep; label: string }[] = [
    { key: "PICKUP", label: "Jemput" },
    { key: "DESTINATION", label: destLabel },
    { key: "CONFIRM", label: "Konfirmasi" },
  ];
  const activeIdx = steps.findIndex((s) => s.key === bookingStep);

  return (
    <div className="flex items-center gap-1">
      {steps.map((s, i) => {
        const done = i < activeIdx;
        const active = i === activeIdx;
        return (
          <div key={s.key} className="flex flex-1 items-center gap-1">
            <div
              className={cn(
                "flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-bold",
                active && "bg-slate-900 text-white",
                done && !active && "bg-emerald-100 text-emerald-800",
                !active && !done && "bg-slate-100 text-slate-500"
              )}
            >
              <span
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded-full text-[9px]",
                  active && "bg-white text-slate-900",
                  done && !active && "bg-emerald-600 text-white",
                  !active && !done && "bg-slate-300 text-white"
                )}
              >
                {done ? <Check className="h-2.5 w-2.5" /> : i + 1}
              </span>
              {s.label}
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "h-0.5 w-2 shrink-0 rounded-full",
                  i < activeIdx ? "bg-emerald-400" : "bg-slate-200"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Satu peta — alur step: PICKUP → DESTINATION → CONFIRM.
 */
export function RideLocationMapSection({
  ride,
  onStepChange,
}: {
  ride: RideHook;
  onStepChange?: (step: BookingStep) => void;
}) {
  const [bookingStep, setBookingStep] = useState<BookingStep>("PICKUP");
  const [pickupLocked, setPickupLocked] = useState(false);
  const [destLocked, setDestLocked] = useState(false);

  const destLabel = ride.serviceType === "PAKET" ? "Penerima" : "Tujuan";
  const isPassenger = ride.showFlexiblePickup;

  const centerLat =
    bookingStep === "PICKUP"
      ? ride.pickupLat
      : bookingStep === "DESTINATION"
        ? ride.destLat
        : (ride.pickupLat + ride.destLat) / 2;
  const centerLng =
    bookingStep === "PICKUP"
      ? ride.pickupLng
      : bookingStep === "DESTINATION"
        ? ride.destLng
        : (ride.pickupLng + ride.destLng) / 2;

  const panTrigger =
    bookingStep === "PICKUP"
      ? ride.pickupMapFlyTrigger
      : ride.mapFlyTrigger;

  const onMapIdle =
    bookingStep === "PICKUP"
      ? ride.handlePickupMapIdle
      : bookingStep === "DESTINATION"
        ? ride.handleDestMapChange
        : () => {};

  const canConfirmPickup =
    ride.pickupAddress.trim().length > 0 &&
    ride.pickupAddress !== PICKUP_PLACEHOLDER;

  const canConfirmDest =
    ride.destAddress.trim().length > 0 &&
    ride.destAddress !== DEST_PLACEHOLDER;

  useEffect(() => {
    onStepChange?.(bookingStep);
  }, [bookingStep, onStepChange]);

  useEffect(() => {
    setBookingStep("PICKUP");
    setPickupLocked(false);
    setDestLocked(false);
  }, [ride.serviceType]);

  function resetBooking() {
    setBookingStep("PICKUP");
    setPickupLocked(false);
    setDestLocked(false);
  }

  function confirmPickup() {
    if (!canConfirmPickup) return;
    setPickupLocked(true);
    setBookingStep("DESTINATION");
    ride.seedDestinationNearPickup();
  }

  function confirmDestination() {
    if (!canConfirmDest) return;
    setDestLocked(true);
    setBookingStep("CONFIRM");
  }

  const onPickupSearchSelect = (loc: Parameters<typeof ride.handlePickupSearchSelect>[0]) => {
    ride.handlePickupSearchSelect(loc);
  };

  const onDestinationSearchSelect = (
    loc: Parameters<typeof ride.handleDestinationSearchSelect>[0]
  ) => {
    ride.handleDestinationSearchSelect(loc);
  };

  const onDestinationHit = (hit: Parameters<typeof ride.applyDestinationHit>[0]) => {
    ride.applyDestinationHit(hit);
  };

  return (
    <section className="glass-card relative space-y-3 p-4">
      <StepIndicator bookingStep={bookingStep} destLabel={destLabel} />

      {/* --- Input area per step (above map) --- */}
      {bookingStep === "PICKUP" && (
        <>
          <p className="text-sm font-bold text-emerald-800">Pilih Titik Jemput</p>
          {isPassenger ? (
            <LocationSearchBar
              label="Alamat jemput"
              value={ride.pickupAddress}
              onChange={ride.onPickupAddressChange}
              onSelect={onPickupSearchSelect}
              placeholder="Contoh: Bandara Soekarno-Hatta, Mall Parung…"
              nearLat={ride.pickupLat}
              nearLng={ride.pickupLng}
              accentClass="text-emerald-800"
            />
          ) : (
            <div>
              <Label className="text-xs font-bold text-emerald-800">Titik jemput paket</Label>
              <Input
                value={ride.pickupAddress}
                onChange={(e) => ride.onPickupAddressChange(e.target.value)}
                placeholder="Lokasi pengambilan paket"
                className="mt-1 border-slate-200 bg-white text-slate-900"
              />
            </div>
          )}
          {isPassenger && (
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
          )}
        </>
      )}

      {bookingStep === "DESTINATION" && (
        <>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
            <p className="flex items-center gap-1 text-[10px] font-bold text-emerald-800">
              <Lock className="h-3 w-3" />
              Jemput terkunci
            </p>
            <p className="mt-0.5 line-clamp-2 text-xs text-slate-700">{ride.pickupAddress}</p>
          </div>
          {isPassenger ? (
            <LocationSearchBar
              label={
                ride.serviceType === "PAKET" ? "Alamat penerima" : "Alamat tujuan"
              }
              value={ride.destAddress}
              onChange={ride.onDestAddressChange}
              onSelect={onDestinationSearchSelect}
              placeholder="Ketik alamat tujuan..."
              nearLat={ride.pickupLat}
              nearLng={ride.pickupLng}
              accentClass="text-sky-800"
            />
          ) : (
            <div className="relative">
              <Label className="text-xs font-semibold text-sky-800">Alamat penerima</Label>
              <Input
                value={ride.destAddress}
                onChange={(e) => ride.onDestAddressChange(e.target.value)}
                placeholder="Alamat pengantaran paket..."
                className="mt-1 border-slate-200 bg-white pr-9 text-slate-900"
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
                        onClick={() => onDestinationHit(hit)}
                      >
                        {hit.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {bookingStep === "CONFIRM" && (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
          <div className="flex gap-2">
            <MapPinned className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
            <div>
              <p className="font-bold text-emerald-800">Jemput</p>
              <p className="text-slate-700">{ride.pickupAddress}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
            <div>
              <p className="font-bold text-sky-800">{destLabel}</p>
              <p className="text-slate-700">{ride.destAddress}</p>
            </div>
          </div>
        </div>
      )}

      {/* --- Single map --- */}
      <RideMapContainer
        bookingStep={bookingStep}
        centerLat={centerLat}
        centerLng={centerLng}
        pickupLat={ride.pickupLat}
        pickupLng={ride.pickupLng}
        destLat={ride.destLat}
        destLng={ride.destLng}
        destPinLabel={destLabel}
        pickupLocked={pickupLocked}
        destLocked={destLocked}
        hubLat={ride.pickupLat}
        hubLng={ride.pickupLng}
        panTrigger={panTrigger}
        onMapIdle={onMapIdle}
        height={bookingStep === "CONFIRM" ? 200 : 220}
      />

      <p className="text-[10px] text-muted-foreground">
        {bookingStep === "PICKUP" &&
          "Geser peta — pin hijau di tengah mengatur titik jemput."}
        {bookingStep === "DESTINATION" &&
          `Geser peta — pin biru di tengah mengatur ${destLabel.toLowerCase()}.`}
        {bookingStep === "CONFIRM" &&
          "Rute jemput → tujuan. Periksa alamat dan tarif sebelum memesan."}
      </p>

      {/* --- Dynamic action buttons --- */}
      {bookingStep === "PICKUP" && (
        <Button
          type="button"
          className="h-12 w-full rounded-2xl bg-emerald-600 text-base font-bold text-white hover:bg-emerald-700"
          disabled={!canConfirmPickup}
          onClick={confirmPickup}
        >
          Konfirmasi Titik Jemput
        </Button>
      )}

      {bookingStep === "DESTINATION" && (
        <Button
          type="button"
          className="h-12 w-full rounded-2xl bg-sky-600 text-base font-bold text-white hover:bg-sky-700"
          disabled={!canConfirmDest}
          onClick={confirmDestination}
        >
          Konfirmasi {destLabel}
        </Button>
      )}

      {bookingStep === "CONFIRM" && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-emerald-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-600">Estimasi jarak</p>
                <p className="text-lg font-bold text-slate-900">
                  {ride.distanceKm.toFixed(2)} km
                </p>
                <p className="text-[10px] text-slate-600">
                  {ride.quoting ? "Memperbarui tarif…" : ride.feeDescription}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold text-slate-600">
                  Tarif {ride.serviceType}
                </p>
                <p className="flex items-center justify-end gap-2 text-2xl font-bold text-emerald-700">
                  {formatIdr(ride.rideFee)}
                  {ride.quoting && (
                    <Loader2 className="h-5 w-5 shrink-0 animate-spin opacity-70" />
                  )}
                </p>
              </div>
            </div>
          </div>

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

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full text-slate-600 hover:text-slate-900"
            onClick={resetBooking}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Kembali — ubah rute
          </Button>
        </div>
      )}

      {ride.gpsInitStatus === "INITIALIZING_GPS" && bookingStep === "PICKUP" && (
        <p className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
          {ride.gpsLoading ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          ) : (
            <Navigation className="h-3.5 w-3.5 shrink-0 opacity-70" />
          )}
          {CUSTOMER_GPS_INITIALIZING_MSG}
        </p>
      )}
    </section>
  );
}
