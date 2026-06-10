import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-server";
import {
  applyRegionalEntityScope,
  serviceCityWithinAdminScope,
} from "@/lib/admin/regional-scope";
import {
  enforceMethod,
  enforceRateLimit,
  readJsonBody,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { isValidUuid, sanitizeEmail, sanitizeText } from "@/lib/security/validate";

/** Daftar driver — filter regional di server (bukan di browser). */
export async function GET(req: Request) {
  const methodBlock = enforceMethod(req, ["GET"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "admin-drivers-get", RATE_LIMITS.api);
  if (rl) return rl;

  const auth = await requireAdmin();
  if ("error" in auth) {
    return secureJsonResponse({ error: auth.error }, { status: auth.status });
  }

  const admin = createAdminClient();
  let query = admin
    .from("drivers")
    .select("*, profiles(email), service_cities(name)")
    .order("created_at", { ascending: false });

  query = applyRegionalEntityScope(query, auth);

  const { data, error } = await query;
  if (error) {
    return secureJsonResponse({ error: error.message }, { status: 500 });
  }

  return secureJsonResponse({ ok: true, drivers: data ?? [] });
}

export async function POST(req: Request) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "admin-drivers", RATE_LIMITS.api);
  if (rl) return rl;

  const auth = await requireAdmin();
  if ("error" in auth) {
    return secureJsonResponse({ error: auth.error }, { status: auth.status });
  }

  const parsed = await readJsonBody<{
    name?: string;
    phone?: string;
    vehicle_plate?: string;
    email?: string;
    password?: string;
    service_city_id?: string;
  }>(req);

  if ("error" in parsed) return parsed.error;

  const name = sanitizeText(parsed.data.name, 120);
  const phone = sanitizeText(parsed.data.phone, 20)?.replace(/\s/g, "") ?? null;
  const vehiclePlate = sanitizeText(parsed.data.vehicle_plate, 20);
  const email = sanitizeEmail(parsed.data.email);
  const password =
    typeof parsed.data.password === "string" && parsed.data.password.length >= 6
      ? parsed.data.password
      : null;

  if (!name || !phone || phone.length < 8) {
    return secureJsonResponse({ error: "Nama dan nomor telepon wajib diisi" }, { status: 400 });
  }
  if (!email || !password) {
    return secureJsonResponse(
      { error: "Email dan password (min. 6 karakter) wajib untuk akun login driver" },
      { status: 400 }
    );
  }

  const serviceCityId = isValidUuid(parsed.data.service_city_id)
    ? parsed.data.service_city_id
    : null;
  if (!serviceCityId) {
    return secureJsonResponse({ error: "Kota layanan driver wajib dipilih" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: city } = await admin
    .from("service_cities")
    .select("id, province_id, city_id")
    .eq("id", serviceCityId)
    .eq("is_active", true)
    .maybeSingle();

  if (!city) {
    return secureJsonResponse({ error: "Kota layanan tidak valid" }, { status: 400 });
  }

  if (!serviceCityWithinAdminScope(auth, city)) {
    return secureJsonResponse(
      { error: "Kota layanan di luar wilayah admin Anda" },
      { status: 403 }
    );
  }

  const { data: phoneUsed } = await admin
    .from("drivers")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();

  if (phoneUsed) {
    return secureJsonResponse({ error: "Nomor telepon sudah terdaftar" }, { status: 409 });
  }

  const { data: authUser, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role: "driver" },
  });

  if (createErr) {
    return secureJsonResponse({ error: createErr.message }, { status: 400 });
  }

  const uid = authUser.user.id;

  const { error: profileErr } = await admin.from("profiles").upsert({
    id: uid,
    email,
    name,
    phone,
    role: "driver",
  });

  if (profileErr) {
    await admin.auth.admin.deleteUser(uid);
    return secureJsonResponse({ error: profileErr.message }, { status: 500 });
  }

  const { data: driver, error: driverErr } = await admin
    .from("drivers")
    .insert({
      profile_id: uid,
      name,
      phone,
      vehicle_plate: vehiclePlate,
      service_city_id: serviceCityId,
      province_id: city.province_id,
      city_id: city.city_id,
      status: "offline",
    })
    .select("id")
    .single();

  if (driverErr) {
    await admin.from("profiles").delete().eq("id", uid);
    await admin.auth.admin.deleteUser(uid);
    return secureJsonResponse({ error: driverErr.message }, { status: 500 });
  }

  return secureJsonResponse({
    ok: true,
    driverId: driver.id,
    userId: uid,
    email,
  });
}
