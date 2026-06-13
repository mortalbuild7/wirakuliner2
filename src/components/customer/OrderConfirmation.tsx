"use client";

import { useCallback, useState } from "react";
import { Bike, Car, Loader2, MapPinOff, Package } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  checkDriverAvailability,
  EMPTY_DRIVER_ZONE_MESSAGE,
} from "@/app/actions/matchDriver";
import type { useNgojekRide } from "@/hooks/use-ngojek-ride";
import {
  assertCustomerGeolocationReady,
  notifyCustomerOrderError,
  notifyFormValidationErrors,
  withCustomerOrderTimeout,
} from "@/lib/customer-order-feedback";
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
  if (ride.distanceKm < NGOJEK_MIN_DISTANCE_KM) {
    blockers.push(
      `jarak minimal ${NGOJEK_MIN_DISTANCE_KM} km (saat ini ${ride.distanceKm.toFixed(3)} km)`
    );
  }
  if (!ride.userId) blockers.push("login customer");

  return blockers;
}

/**
 * Konfirmasi & pemesanan customer — pre-check driver 3 km sebelum order dibuat.
 * Tombol selalu bisa diklik; setiap hambatan ditampilkan via toast + alert di HP.
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

  const submitBlockers = collectSubmitBlockers(ride, uiState);
  const canSubmit = submitBlockers.length === 0;
  const busy = ride.placing || uiState === "checking" || uiState === "placing";

  const closeEmptyState = useCallback(() => {
    setUiState("idle");
  }, []);

  const handleOrderNow = useCallback(async () => {
    if (busy) {
      notifyCustomerOrderError("Mohon tunggu, pesanan sedang diproses.");
      return;
    }

    const geo = assertCustomerGeolocationReady();
    if (!geo.ok) {
      notifyCustomerOrderError(geo.message);
      return;
    }

    const blockers = collectSubmitBlockers(ride, uiState);
    if (blockers.length > 0) {
      notifyFormValidationErrors(blockers);
      return;
    }

    try {
      if (isTransitRide) {
        const pickupCoords = validatePickupCoordinates(ride.pickupLat, ride.pickupLng);
        if (!pickupCoords.ok) {
          notifyCustomerOrderError(CUSTOMER_GPS_REQUIRED_MSG);
          return;
        }

        setUiState("checking");
        try {
          const result = await withCustomerOrderTimeout(
            checkDriverAvailability(
              pickupCoords.lat,
              pickupCoords.lng,
              ride.serviceType
            ),
            30_000,
            "Memeriksa ketersediaan driver"
          );

          if (!result.available) {
            if (process.env.NODE_ENV === "development") {
              console.info("[driver-availability]", result);
            }
            if (result.error_code === "INVALID_COORDINATES") {
              notifyCustomerOrderError(
                result.message ?? CUSTOMER_GPS_REQUIRED_MSG
              );
              return;
            }
            if (
              result.error_code === "RPC_ERROR" ||
              result.error_code === "SESSION_EXPIRED"
            ) {
              notifyCustomerOrderError(
                result.message ?? "Server error",
                result.debug_info.server_error_detail ?? result.message
              );
              return;
            }
            toast.warning(EMPTY_DRIVER_ZONE_MESSAGE);
            setUiState("EMPTY_STATE");
            return;
          }
        } catch (error) {
          notifyCustomerOrderError(
            "Crash Frontend: gagal memeriksa ketersediaan driver.",
            error
          );
          return;
        }
      }

      setUiState("placing");
      try {
        await ride.bookRide();
      } catch (error) {
        notifyCustomerOrderError("Crash Frontend: gagal membuat pesanan.", error);
      }
    } catch (error) {
      notifyCustomerOrderError("Crash Frontend: tombol pesan error.", error);
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
        <p className="mt-2 text-center text-[11px] font-medium text-amber-800">
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
