import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-server";
import { deleteAuthUser } from "@/lib/admin-delete-ops";
import {
  entityWithinAdminScope,
  serviceCityWithinAdminScope,
} from "@/lib/admin/regional-scope";
import {
  enforceMethod,
  enforceRateLimit,
  readJsonBody,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { isValidUuid, sanitizeText } from "@/lib/security/validate";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const methodBlock = enforceMethod(req, ["PATCH"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "admin-driver-patch", RATE_LIMITS.adminWrite);
  if (rl) return rl;

  const auth = await requireAdmin();
  if ("error" in auth) {
    return secureJsonResponse({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  if (!isValidUuid(id)) {
    return secureJsonResponse({ error: "ID driver tidak valid" }, { status: 400 });
  }

  const parsed = await readJsonBody<{
    action?: "suspend" | "unsuspend";
    note?: string;
    name?: string;
    phone?: string;
    vehicle_plate?: string | null;
    service_city_id?: string;
  }>(req);
  if ("error" in parsed) return parsed.error;

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("drivers")
    .select("id, profile_id, province_id, city_id, status")
    .eq("id", id)
    .maybeSingle();

  if (!existing) {
    return secureJsonResponse({ error: "Driver tidak ditemukan" }, { status: 404 });
  }

  if (!entityWithinAdminScope(auth, existing)) {
    return secureJsonResponse({ error: "Driver di luar wilayah admin" }, { status: 403 });
  }

  if (parsed.data.action === "suspend" || parsed.data.action === "unsuspend") {
    if (!existing.profile_id) {
      return secureJsonResponse({ error: "Driver belum punya akun login" }, { status: 400 });
    }

    const note = sanitizeText(parsed.data.note, 500);
    if (parsed.data.action === "suspend" && !note) {
      return secureJsonResponse({ error: "Catatan suspend wajib diisi" }, { status: 400 });
    }

    const until = new Date();
    until.setDate(until.getDate() + 365);

    const profilePatch =
      parsed.data.action === "suspend"
        ? {
            account_status: "suspended" as const,
            admin_note: note,
            suspended_until: until.toISOString(),
          }
        : {
            account_status: "active" as const,
            admin_note: note ?? null,
            suspended_until: null,
          };

    const { error: profileErr } = await admin
      .from("profiles")
      .update(profilePatch)
      .eq("id", existing.profile_id);

    if (profileErr) {
      return secureJsonResponse({ error: profileErr.message }, { status: 500 });
    }

    return secureJsonResponse({ ok: true, action: parsed.data.action });
  }

  const name = sanitizeText(parsed.data.name, 120);
  const phone = sanitizeText(parsed.data.phone, 20)?.replace(/\s/g, "") ?? null;
  const vehiclePlate =
    parsed.data.vehicle_plate === null
      ? null
      : sanitizeText(parsed.data.vehicle_plate, 20);
  const serviceCityId = isValidUuid(parsed.data.service_city_id)
    ? parsed.data.service_city_id
    : null;

  const driverPatch: Record<string, unknown> = {};
  if (name) driverPatch.name = name;
  if (phone && phone.length >= 8) driverPatch.phone = phone;
  if (parsed.data.vehicle_plate !== undefined) driverPatch.vehicle_plate = vehiclePlate;

  if (serviceCityId) {
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
    driverPatch.service_city_id = serviceCityId;
    driverPatch.province_id = city.province_id;
    driverPatch.city_id = city.city_id;
  }

  if (Object.keys(driverPatch).length === 0) {
    return secureJsonResponse({ error: "Tidak ada data yang diubah" }, { status: 400 });
  }

  const { error } = await admin.from("drivers").update(driverPatch).eq("id", id);

  if (error) {
    return secureJsonResponse({ error: error.message }, { status: 500 });
  }

  if (existing.profile_id && (name || phone)) {
    await admin
      .from("profiles")
      .update({
        ...(name ? { name } : {}),
        ...(phone ? { phone } : {}),
      })
      .eq("id", existing.profile_id);
  }

  return secureJsonResponse({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const methodBlock = enforceMethod(_req, ["DELETE"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(_req, "admin-driver-delete", RATE_LIMITS.adminWrite);
  if (rl) return rl;

  const auth = await requireAdmin();
  if ("error" in auth) {
    return secureJsonResponse({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  if (!isValidUuid(id)) {
    return secureJsonResponse({ error: "ID driver tidak valid" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: driver } = await admin
    .from("drivers")
    .select("id, profile_id, name, status, photo_url, province_id, city_id")
    .eq("id", id)
    .maybeSingle();

  if (!driver) {
    return secureJsonResponse({ error: "Driver tidak ditemukan" }, { status: 404 });
  }

  if (!entityWithinAdminScope(auth, driver)) {
    return secureJsonResponse({ error: "Driver di luar wilayah admin" }, { status: 403 });
  }

  if (driver.status === "delivering") {
    return secureJsonResponse(
      { error: "Driver sedang mengantar — selesaikan atau ubah status dulu" },
      { status: 400 }
    );
  }

  const { count: activeJobs } = await admin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("driver_id", id)
    .in("order_status", ["paid", "preparing", "ready_for_pickup", "on_the_way"]);

  if (activeJobs && activeJobs > 0) {
    return secureJsonResponse(
      { error: "Driver masih punya pesanan aktif — batalkan atau selesaikan dulu" },
      { status: 400 }
    );
  }

  if (driver.photo_url) {
    try {
      const path = `${driver.id}.webp`;
      await admin.storage.from("driver-avatars").remove([path, `${driver.id}.jpg`]);
    } catch {
      /* ignore storage cleanup */
    }
  }

  const profileId = driver.profile_id;
  const { error: delErr } = await admin.from("drivers").delete().eq("id", id);
  if (delErr) {
    return secureJsonResponse({ error: delErr.message }, { status: 500 });
  }

  if (profileId) {
    try {
      await deleteAuthUser(admin, profileId);
    } catch (e) {
      return secureJsonResponse(
        {
          error: e instanceof Error ? e.message : "Gagal hapus akun auth driver",
          partial: true,
        },
        { status: 500 }
      );
    }
  }

  return secureJsonResponse({ ok: true, deletedDriverId: id, deletedAuthUser: Boolean(profileId) });
}
