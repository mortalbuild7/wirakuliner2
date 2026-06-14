import { NextResponse } from "next/server";
import { applySecurityHeaders } from "@/lib/security/headers";

/** Health check ringan untuk probe koneksi APK driver. */
export async function GET() {
  return applySecurityHeaders(NextResponse.json({ ok: true }));
}
