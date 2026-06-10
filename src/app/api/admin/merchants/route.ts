import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-server";
import { applyRegionalEntityScope } from "@/lib/admin/regional-scope";
import {
  enforceMethod,
  enforceRateLimit,
  readJsonBody,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { parseBoundedNumber, sanitizeEmail, sanitizeText } from "@/lib/security/validate";

/** Daftar merchant — scoped per tier admin. */
export async function GET(req: Request) {
  const methodBlock = enforceMethod(req, ["GET"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "admin-merchants-get", RATE_LIMITS.api);
  if (rl) return rl;

  const auth = await requireAdmin();
  if ("error" in auth) {
    return secureJsonResponse({ error: auth.error }, { status: auth.status });
  }

  const admin = createAdminClient();
  let query = admin
    .from("merchants")
    .select("*, owner:profiles!owner_id(email, name)")
    .order("created_at", { ascending: false });

  query = applyRegionalEntityScope(query, auth);

  const { data, error } = await query;
  if (error) {
    return secureJsonResponse({ error: error.message }, { status: 500 });
  }

  return secureJsonResponse({ ok: true, merchants: data ?? [] });
}

export async function POST(req: Request) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "admin-merchants", RATE_LIMITS.api);
  if (rl) return rl;

  const auth = await requireAdmin();
  if ("error" in auth) {
    return secureJsonResponse({ error: auth.error }, { status: auth.status });
  }

  const parsed = await readJsonBody<{
    owner_name?: string;
    email?: string;
    password?: string;
    shop_name?: string;
    address?: string;
    description?: string;
    category?: string;
    latitude?: number;
    longitude?: number;
  }>(req);

  if ("error" in parsed) return parsed.error;

  const ownerName = sanitizeText(parsed.data.owner_name, 120);
  const email = sanitizeEmail(parsed.data.email);
  const password =
    typeof parsed.data.password === "string" && parsed.data.password.length >= 6
      ? parsed.data.password
      : null;
  const shopName = sanitizeText(parsed.data.shop_name, 120);
  const address = sanitizeText(parsed.data.address, 300);
  const description = sanitizeText(parsed.data.description, 500);
  const category = sanitizeText(parsed.data.category, 40) ?? "makanan";
  const latitude = parseBoundedNumber(parsed.data.latitude, -90, 90);
  const longitude = parseBoundedNumber(parsed.data.longitude, -180, 180);

  if (!ownerName || !shopName || !address) {
    return secureJsonResponse(
      { error: "Nama pemilik, nama toko, dan alamat wajib diisi" },
      { status: 400 }
    );
  }
  if (!email || !password) {
    return secureJsonResponse(
      { error: "Email dan password (min. 6 karakter) wajib untuk akun merchant" },
      { status: 400 }
    );
  }
  if (latitude === null || longitude === null) {
    return secureJsonResponse({ error: "Koordinat toko tidak valid" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: authUser, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: ownerName, role: "merchant" },
  });

  if (createErr) {
    return secureJsonResponse({ error: createErr.message }, { status: 400 });
  }

  const uid = authUser.user.id;

  const { error: profileErr } = await admin.from("profiles").upsert({
    id: uid,
    email,
    name: ownerName,
    role: "merchant",
    account_status: "active",
  });

  if (profileErr) {
    await admin.auth.admin.deleteUser(uid);
    return secureJsonResponse({ error: profileErr.message }, { status: 500 });
  }

  const { data: existingShop } = await admin
    .from("merchants")
    .select("id")
    .eq("owner_id", uid)
    .maybeSingle();

  if (existingShop) {
    return secureJsonResponse(
      { error: "Pemilik ini sudah memiliki toko terdaftar" },
      { status: 409 }
    );
  }

  const provinceId =
    auth.adminRole === "PROVINCE_ADMIN" || auth.adminRole === "CITY_ADMIN"
      ? auth.provinceId
      : null;
  const cityId = auth.adminRole === "CITY_ADMIN" ? auth.cityId : null;

  const { data: merchant, error: merchantErr } = await admin
    .from("merchants")
    .insert({
      owner_id: uid,
      name: shopName,
      address,
      description: description ?? "",
      category,
      latitude,
      longitude,
      province_id: provinceId,
      city_id: cityId,
      is_active: true,
      is_open: false,
      admin_suspended: false,
      approval_status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: auth.userId,
    })
    .select("id")
    .single();

  if (merchantErr) {
    await admin.from("profiles").delete().eq("id", uid);
    await admin.auth.admin.deleteUser(uid);
    return secureJsonResponse({ error: merchantErr.message }, { status: 500 });
  }

  return secureJsonResponse({
    ok: true,
    merchantId: merchant.id,
    ownerId: uid,
    email,
  });
}
