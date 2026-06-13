import { NextResponse } from "next/server";
import { runCheckDriverAvailability } from "@/lib/check-driver-handler";
import { extractServerErrorMessage } from "@/lib/server-error-message";
import {
  enforceDistributedRateLimit,
  enforceMethod,
} from "@/lib/security/enforce";
import { applySecurityHeaders } from "@/lib/security/headers";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

function jsonOk(body: unknown) {
  return applySecurityHeaders(NextResponse.json(body, { status: 200 }));
}

export async function POST(request: Request) {
  try {
    const methodBlock = enforceMethod(request, ["POST"]);
    if (methodBlock) {
      return jsonOk({
        success: false,
        error: "Method not allowed",
      });
    }

    const rl = await enforceDistributedRateLimit(
      request,
      "check-driver-api",
      RATE_LIMITS.driverMatchCheck
    );
    if (rl) {
      return jsonOk({
        success: false,
        error: "Terlalu banyak permintaan. Coba lagi nanti.",
      });
    }

    let body: {
      lat?: unknown;
      lng?: unknown;
      serviceType?: unknown;
      packageVolumeCm3?: unknown;
      quotedFare?: unknown;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch (error) {
      console.error("LOG ERROR GEOLOKASI LENGKAP:", error);
      return jsonOk({
        success: false,
        error: extractServerErrorMessage(error),
      });
    }

    const { lat, lng, serviceType, packageVolumeCm3, quotedFare } = body;
    const result = await runCheckDriverAvailability(request, {
      lat,
      lng,
      serviceType,
      packageVolumeCm3,
      quotedFare,
    });
    return jsonOk(result);
  } catch (error) {
    console.error("LOG ERROR GEOLOKASI LENGKAP:", error);
    return jsonOk({
      success: false,
      error: extractServerErrorMessage(error),
    });
  }
}
