import { rejectTrustedOwnerIdsInBody } from "@/lib/security/auth-owner";
import {
  enforceMethod,
  enforceRateLimit,
  readJsonBody,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { sanitizeDescription, sanitizeName, sanitizePublicText } from "@/lib/security/sanitize";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "merchant-setup", RATE_LIMITS.apiWrite);
  if (rl) return rl;

  try {
    const parsed = await readJsonBody<{
      name?: string;
      address?: string;
      description?: string;
      category?: string;
      latitude?: number;
      longitude?: number;
      owner_id?: string;
      merchant_id?: string;
    }>(req);
    if ("error" in parsed) return parsed.error;

    const idorBlock = rejectTrustedOwnerIdsInBody(parsed.data as Record<string, unknown>);
    if (idorBlock) return idorBlock;

    const body = parsed.data;
    const name = sanitizeName(body.name);
    const address = sanitizePublicText(body.address, 300);
    const description = sanitizeDescription(body.description) ?? "";
    const category = sanitizePublicText(body.category, 40) ?? "makanan";
    const { latitude, longitude } = body;

    if (!name || !address) {
      return secureJsonResponse({ error: "Nama toko dan alamat wajib diisi" }, { status: 400 });
    }

    const lat =
      typeof latitude === "number" && Number.isFinite(latitude) ? latitude : null;
    const lng =
      typeof longitude === "number" && Number.isFinite(longitude) ? longitude : null;
    if (
      lat == null ||
      lng == null ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      return secureJsonResponse(
        { error: "Koordinat GPS toko (latitude & longitude) wajib diisi dengan benar" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return secureJsonResponse({ error: "Belum login. Silakan masuk ulang." }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "merchant") {
      return secureJsonResponse(
        { error: "Akun ini bukan merchant. Daftar di /register?role=merchant" },
        { status: 403 }
      );
    }

    const { data: existing } = await supabase
      .from("merchants")
      .select("id, approval_status")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (existing) {
      return secureJsonResponse({
        ok: true,
        merchantId: existing.id,
        alreadyExists: true,
        approvalStatus: existing.approval_status ?? "approved",
      });
    }

    const { data: merchant, error } = await supabase
      .from("merchants")
      .insert({
        owner_id: user.id,
        name,
        address,
        description,
        category,
        latitude: lat,
        longitude: lng,
        is_active: false,
        is_open: false,
        approval_status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      return secureJsonResponse({ error: error.message }, { status: 500 });
    }

    return secureJsonResponse({
      ok: true,
      merchantId: merchant.id,
      approvalStatus: "pending",
      pendingApproval: true,
    });
  } catch (e) {
    return secureJsonResponse(
      { error: e instanceof Error ? e.message : "Gagal menyimpan toko" },
      { status: 500 }
    );
  }
}
