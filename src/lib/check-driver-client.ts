"use client";

import type { CheckDriverApiResponse } from "@/lib/check-driver-types";
import type { ServiceType } from "@/lib/service-types";

export type { CheckDriverApiResponse } from "@/lib/check-driver-types";

export type CheckDriverCoordsInput = {
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
};

export type CheckDriverClientParams = CheckDriverCoordsInput & {
  serviceType: ServiceType;
  packageVolumeCm3?: number;
  quotedFare?: number;
  timeoutMs?: number;
};

function resolvePickupCoords(input: CheckDriverCoordsInput): {
  lat: number;
  lng: number;
} {
  const lat = input.latitude ?? input.lat ?? Number.NaN;
  const lng = input.longitude ?? input.lng ?? Number.NaN;
  return { lat, lng };
}

export async function fetchCheckDriverAvailability(
  params: CheckDriverClientParams
): Promise<CheckDriverApiResponse> {
  const { lat, lng } = resolvePickupCoords(params);
  const serviceType = params.serviceType;
  const packageVolumeCm3 = params.packageVolumeCm3 ?? 0;
  const quotedFare = params.quotedFare ?? 0;
  const timeoutMs = params.timeoutMs ?? 30_000;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  const payload = {
    lat,
    lng,
    latitude: lat,
    longitude: lng,
    serviceType,
    service_type: serviceType,
    packageVolumeCm3,
    quotedFare,
  };

  try {
    const res = await fetch("/api/check-driver", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    let data: CheckDriverApiResponse;
    try {
      data = (await res.json()) as CheckDriverApiResponse;
    } catch (parseError) {
      return {
        success: false,
        error:
          parseError instanceof Error
            ? parseError.message
            : "Respons server tidak valid (bukan JSON)",
      };
    }

    if (!data || typeof data !== "object" || !("success" in data)) {
      return {
        success: false,
        error: `Respons server tidak dikenali (HTTP ${res.status})`,
      };
    }

    return data;
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Memeriksa ketersediaan driver — waktu habis (timeout)"
        : error instanceof Error
          ? error.message
          : String(error);
    return { success: false, error: message };
  } finally {
    window.clearTimeout(timer);
  }
}
