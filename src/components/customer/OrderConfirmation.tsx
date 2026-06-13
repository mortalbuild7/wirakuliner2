"use client";

import { useCallback, useState } from "react";
import { Bike, Car, Loader2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchCheckDriverAvailability } from "@/lib/check-driver-client";
import type { useNgojekRide } from "@/hooks/use-ngojek-ride";
import {
  assertCustomerGeolocationReady,
  logCustomerOrderDebug,
  notifyCustomerOrderToast,
  notifyFormValidationErrors,
} from "@/lib/customer-order-feedback";
import { packageVolumeCm3 } from "@/lib/ngojek-ride-logic";
import { isTransitProximityServiceType } from "@/lib/jabodetabek-policy";
import {
  CUSTOMER_GPS_SYNC_MSG,
  validatePickupCoordinates,
} from "@/lib/pickup-coords";
import { cn } from "@/lib/utils";

type OrderUiState = "idle" | "placing";

type OrderConfirmationProps = {
  ride: ReturnType<typeof useNgojekRide>;
};

function collectSubmitBlockers(
  ride: ReturnType<typeof useNgojekRide>,
  uiState: OrderUiState
): string[] {
  const blockers: string[] = [];

  if (ride.placing) blockers.push("pesanan sedang diproses");
  if (uiState === "placing") blockers.push("sedang memproses pesanan");
  if (!ride.destAddress.trim()) blockers.push("alamat tujuan");
  if (ride.rideFee <= 0) blockers.push("tarif ride (belum dihitung)");
  if (!ride.userId) blockers.push("login customer");

  return blockers;
}

/**
 * Pemesanan customer — cek driver hanya untuk log debug.
 * Selama testing HP fisik: selalu lanjut ke pembuatan order (bypass UI blokir).
 */
export function OrderConfirmation({ ride }: OrderConfirmationProps) {
  const [uiState, setUiState] = useState<OrderUiState>("idle");

  const isTransitRide = isTransitProximityServiceType(ride.serviceType);

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

  const submitBlockers = collectSubmitBlockers(ride, uiState);
  const canSubmit = submitBlockers.length === 0;
  const busy = ride.placing || uiState === "placing";

  const handleOrderNow = useCallback(async () => {
    if (busy) {
      notifyCustomerOrderToast("Mohon tunggu, pesanan sedang diproses.", "info");
      return;
    }

    const geo = assertCustomerGeolocationReady();
    if (!geo.ok) {
      notifyCustomerOrderToast(geo.message, "warning");
      return;
    }

    const blockers = collectSubmitBlockers(ride, uiState);
    if (blockers.length > 0) {
      notifyFormValidationErrors(blockers);
      return;
    }

    try {
      if (isTransitRide) {
        const freshGps = await ride.refreshPickupCoordsForSubmit();
        const pickupCoords = freshGps.ok
          ? { ok: true as const, lat: freshGps.lat, lng: freshGps.lng }
          : validatePickupCoordinates(ride.pickupLat, ride.pickupLng);

        if (!pickupCoords.ok) {
          notifyCustomerOrderToast(CUSTOMER_GPS_SYNC_MSG, "warning");
          return;
        }

        const pkgVolume =
          ride.serviceType === "PAKET" && ride.packageDetails
            ? packageVolumeCm3(ride.packageDetails)
            : 0;

        const checkPayload = {
          latitude: pickupCoords.lat,
          longitude: pickupCoords.lng,
          lat: pickupCoords.lat,
          lng: pickupCoords.lng,
          serviceType: ride.serviceType,
          packageVolumeCm3: pkgVolume,
          quotedFare: ride.rideFee,
        };

        void fetchCheckDriverAvailability(checkPayload)
          .then((result) => {
            logCustomerOrderDebug("check-driver response", result);
            const isAvailable = true;
            logCustomerOrderDebug("forced availability bypass", {
              isAvailable,
              serverAvailable:
                result.success && "available" in result ? result.available : null,
            });
          })
          .catch((error) => {
            logCustomerOrderDebug("check-driver error", error);
          });
      }

      setUiState("placing");
      try {
        await ride.bookRide();
      } catch (error) {
        logCustomerOrderDebug("book-ride error", error);
        console.error("[book-ride]", error);
      }
    } catch (error) {
      logCustomerOrderDebug("order-submit error", error);
      console.error("[order-submit]", error);
    } finally {
      setUiState("idle");
    }
  }, [busy, isTransitRide, ride, uiState]);

  return (
    <>
      <Button
        type="button"
        className={cn(
          "h-12 w-full rounded-2xl bg-emerald-600 text-base font-bold text-white shadow-md hover:bg-emerald-700",
          !canSubmit && !busy && "opacity-70"
        )}
        disabled={busy}
        aria-disabled={!canSubmit && !busy}
        onClick={() => void handleOrderNow()}
      >
        {busy ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Memesan...
          </>
        ) : (
          <>
            <BookIcon className="mr-2 h-5 w-5" />
            {isTransitRide ? "Pesan Sekarang" : bookLabel}
          </>
        )}
      </Button>

      {!canSubmit && !busy && submitBlockers.length > 0 && (
        <p className="mt-2 text-center text-[11px] font-medium text-slate-500">
          Ketuk tombol untuk melihat syarat yang belum terpenuhi
        </p>
      )}
    </>
  );
}
