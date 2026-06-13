"use client";

import { useCallback, useState } from "react";
import { Bike, Car, Loader2, MapPinOff, Package } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EMPTY_DRIVER_ZONE_MESSAGE } from "@/lib/driver-match-constants";
import { fetchCheckDriverAvailability } from "@/lib/check-driver-client";
import type { useNgojekRide } from "@/hooks/use-ngojek-ride";
import {
  assertCustomerGeolocationReady,
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

function collectSubmitBlockers(
  ride: ReturnType<typeof useNgojekRide>,
  uiState: OrderUiState
): string[] {
  const blockers: string[] = [];

  if (ride.placing) blockers.push("pesanan sedang diproses");
  if (uiState === "checking") blockers.push("sedang memeriksa driver");
  if (!ride.destAddress.trim()) blockers.push("alamat tujuan");
  if (ride.rideFee <= 0) blockers.push("tarif ride (belum dihitung)");
  if (!ride.userId) blockers.push("login customer");

  return blockers;
}

/**
 * Pemesanan customer — cek driver hanya saat tombol Pesan diklik.
 * Validasi radius/jarak sepenuhnya dipercayakan ke API backend.
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
  const busy = ride.placing || uiState === "checking" || uiState === "placing";

  const closeEmptyState = useCallback(() => {
    setUiState("idle");
  }, []);

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

        console.log("[check-driver] request payload", checkPayload);

        setUiState("checking");
        const result = await fetchCheckDriverAvailability(checkPayload);

        console.log("[check-driver] api response", result);

        if (!result.success) {
          window.alert(`Debug Frontend: ${JSON.stringify(result)}`);
          return;
        }

        if (!result.available) {
          window.alert(`Debug Frontend: ${JSON.stringify(result)}`);
          if (result.error_code === "INVALID_COORDINATES") {
            notifyCustomerOrderToast(CUSTOMER_GPS_SYNC_MSG, "warning");
            return;
          }
          toast.warning(EMPTY_DRIVER_ZONE_MESSAGE);
          setUiState("EMPTY_STATE");
          return;
        }
      }

      setUiState("placing");
      try {
        await ride.bookRide();
      } catch (error) {
        notifyCustomerOrderToast("Gagal membuat pesanan. Coba lagi.", "error");
        console.error("[book-ride]", error);
      }
    } catch (error) {
      notifyCustomerOrderToast("Terjadi kesalahan. Coba lagi.", "error");
      console.error("[order-submit]", error);
    } finally {
      setUiState((current) => (current === "EMPTY_STATE" ? current : "idle"));
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
            {uiState === "checking" ? "Memeriksa driver..." : "Memesan..."}
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

      <EmptyDriverModal
        open={uiState === "EMPTY_STATE"}
        onClose={closeEmptyState}
      />
    </>
  );
}
