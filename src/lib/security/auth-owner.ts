import { NextResponse } from "next/server";
import { getAuthDriverFromRequest } from "@/lib/driver-server";
import { createClient } from "@/lib/supabase/server";
import { secureJsonResponse } from "@/lib/security/enforce";
import type { WalletOwnerType } from "@/lib/wallet";

/**
 * IDOR / BOLA — JANGAN percaya identitas pemilik dari body frontend.
 * Field ini bisa disisipkan attacker untuk mengakses/mutasi objek milik user lain.
 *
 * Catatan: `merchantId` / `merchant_id` SENGAJA tidak masuk daftar ini —
 * saat customer pesan kuliner, ID toko adalah data bisnis (toko mana yang dipesan),
 * bukan identitas login. `customer_id` tetap diambil dari JWT di server.
 */
const FORBIDDEN_OWNER_BODY_KEYS = [
  "ownerId",
  "owner_id",
  "driverId",
  "driver_id",
  "customerId",
  "customer_id",
  "userId",
  "user_id",
  "profileId",
  "profile_id",
] as const;

/** Deteksi ID pemilik di body — untuk Server Actions (tanpa NextResponse). */
export function detectTrustedOwnerIdsInBody(
  body: Record<string, unknown>
): string | null {
  for (const key of FORBIDDEN_OWNER_BODY_KEYS) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== "") {
      return "ID pemilik tidak boleh dikirim dari client. Identitas diambil dari sesi login.";
    }
  }
  return null;
}

/** Tolak request yang mencoba menyisipkan ID pemilik di body (Broken Object Level Authorization). */
export function rejectTrustedOwnerIdsInBody(
  body: Record<string, unknown>
): NextResponse | null {
  const msg = detectTrustedOwnerIdsInBody(body);
  if (msg) {
    return secureJsonResponse({ error: msg }, { status: 403 });
  }
  return null;
}

export type AuthenticatedOwner = {
  role: "customer" | "driver" | "merchant" | "admin";
  ownerType: WalletOwnerType;
  ownerId: string;
  userId: string;
};

/**
 * Resolusi pemilik transaksi HANYA dari JWT/session — bukan dari payload.
 * Driver APK: Bearer token; web: cookie Supabase.
 */
export async function resolveAuthenticatedOwner(
  req?: Request
): Promise<AuthenticatedOwner | { error: string; status: number }> {
  const driverAuth = await getAuthDriverFromRequest(req);
  if (!("error" in driverAuth)) {
    return {
      role: "driver",
      ownerType: "driver",
      ownerId: driverAuth.driver.id,
      userId: driverAuth.userId,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Belum login", status: 401 };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role === "admin") {
    return {
      role: "admin",
      ownerType: "customer",
      ownerId: user.id,
      userId: user.id,
    };
  }

  if (profile?.role === "merchant") {
    const { data: merchant } = await supabase
      .from("merchants")
      .select("id")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (!merchant) {
      return { error: "Merchant tidak ditemukan", status: 404 };
    }

    return {
      role: "merchant",
      ownerType: "merchant",
      ownerId: merchant.id,
      userId: user.id,
    };
  }

  if (profile?.role === "driver") {
    return { error: "Profil driver belum terhubung", status: 403 };
  }

  return {
    role: "customer",
    ownerType: "customer",
    ownerId: user.id,
    userId: user.id,
  };
}

/** Pastikan resource milik pemilik yang sedang login (mis. order.customer_id === user). */
export function assertResourceOwner(
  resourceOwnerId: string,
  authenticatedOwnerId: string,
  label = "resource"
): NextResponse | null {
  if (resourceOwnerId !== authenticatedOwnerId) {
    return secureJsonResponse(
      { error: `Akses ditolak — ${label} bukan milik akun Anda` },
      { status: 403 }
    );
  }
  return null;
}
