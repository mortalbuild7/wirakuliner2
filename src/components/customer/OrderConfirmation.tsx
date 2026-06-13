"use client";

import { useCallback, useEffect, useState } from "react";
import { Bike, Car, Loader2, MapPinOff, Package } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  checkDriverAvailability,
  EMPTY_DRIVER_ZONE_MESSAGE,
} from "@/app/actions/matchDriver";
import type { useNgojekRide } from "@/hooks/use-ngojek-ride";
import { NGOJEK_MIN_DISTANCE_KM } from "@/lib/ngojek-ride-logic";
import {
  CUSTOMER_GPS_REQUIRED_MSG,
  validatePickupCoordinates,
} from "@/lib/pickup-coords";
import { cn } from "@/lib/utils";

type OrderUiState = "idle" | "checking" | "EMPTY_STATE" | "placing";

type OrderConfirmationProps = {
  ride: ReturnType<typeof useNgojekRide>;
};

function EmptyDriverModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/55 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="empty-driver-title"
      onClick={onClose}
    >
      <div
        className={cn(
          "w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-xl",
          "transition-all duration-200 ease-out"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center">
          <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-800">
            <MapPinOff className="h-7 w-7" />
          </span>
          <h2
            id="empty-driver-title"
            className="text-lg font-bold text-slate-900"
          >
            Driver belum tersedia
          </h2>
          <p className="mt-3 text-sm font-medium leading-relaxed text-slate-600">
            {EMPTY_DRIVER_ZONE_MESSAGE}
          </p>
          <Button
            type="button"
            className="mt-6 w-full rounded-2xl bg-emerald-600 font-bold text-white hover:bg-emerald-700"
            onClick={onClose}
          >
            Mengerti
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Konfirmasi & pemesanan customer — pre-check driver 3 km sebelum order dibuat.
 */
export function OrderConfirmation({ ride }: OrderConfirmationProps) {
  const [uiState, setUiState] = useState<OrderUiState>("idle");

  const isTransitRide =
    ride.serviceType === "NGOJEK" || ride.serviceType === "NGOMOBIL";

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

  const canSubmit =
    !ride.placing &&
    uiState !== "checking" &&
    ride.destAddress.trim().length > 0 &&
    ride.areaAvailable &&
    ride.rideFee > 0 &&
    ride.distanceKm >= NGOJEK_MIN_DISTANCE_KM;

  const closeEmptyState = useCallback(() => {
    setUiState("idle");
  }, []);

  const handleOrderNow = useCallback(async () => {
    if (!canSubmit) return;

    if (isTransitRide) {
      const pickupCoords = validatePickupCoordinates(ride.pickupLat, ride.pickupLng);
      if (!pickupCoords.ok) {
        toast.error(CUSTOMER_GPS_REQUIRED_MSG);
        return;
      }

      setUiState("checking");
      try {
        const result = await checkDriverAvailability(
          pickupCoords.lat,
          pickupCoords.lng,
          ride.serviceType
        );
        if (!result.available) {
          if (process.env.NODE_ENV === "development") {
            console.info("[driver-availability]", result);
          }
          if (result.error_code === "INVALID_COORDINATES") {
            toast.error(result.message ?? CUSTOMER_GPS_REQUIRED_MSG);
            setUiState("idle");
            return;
          }
          setUiState("EMPTY_STATE");
          return;
        }
      } catch {
        setUiState("idle");
        ride.setPlaceError("Gagal memeriksa ketersediaan driver. Coba lagi.");
        return;
      }
    }

    setUiState("placing");
    try {
      await ride.bookRide();
    } finally {
      setUiState((s) => (s === "EMPTY_STATE" ? s : "idle"));
    }
  }, [
    canSubmit,
    isTransitRide,
    ride.pickupLat,
    ride.pickupLng,
    ride.serviceType,
    ride,
  ]);

  const busy = ride.placing || uiState === "checking" || uiState === "placing";

  return (
    <>
      <Button
        className="h-12 w-full rounded-2xl bg-emerald-600 text-base font-bold text-white shadow-md hover:bg-emerald-700"
        disabled={!canSubmit || busy}
        onClick={() => void handleOrderNow()}
      >
        {busy ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            {uiState === "checking" ? "Memeriksa driver..." : "Memesan..."}
          </>
        ) : (
          <>
            <BookIcon className="mr-2 h-5 w-5" />
            {isTransitRide ? "Pesan Sekarang" : bookLabel}
          </>
        )}
      </Button>

      <EmptyDriverModal
        open={uiState === "EMPTY_STATE"}
        onClose={closeEmptyState}
      />
    </>
  );
}
