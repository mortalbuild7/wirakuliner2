"use client";

import type { CheckDriverApiResponse } from "@/lib/check-driver-types";
import type { ServiceType } from "@/lib/service-types";

export type { CheckDriverApiResponse } from "@/lib/check-driver-types";

export type CheckDriverClientOptions = {
  packageVolumeCm3?: number;
  quotedFare?: number;
  timeoutMs?: number;
};

export async function fetchCheckDriverAvailability(
  lat: number,
  lng: number,
  serviceType: ServiceType,
  options: CheckDriverClientOptions = {}
): Promise<CheckDriverApiResponse> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch("/api/check-driver", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        lat,
        lng,
        serviceType,
        packageVolumeCm3: options.packageVolumeCm3 ?? 0,
        quotedFare: options.quotedFare ?? 0,
      }),
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
