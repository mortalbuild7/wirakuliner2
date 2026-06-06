import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-server";
import { deleteAuthUser } from "@/lib/admin-delete-ops";
import {
  enforceMethod,
  enforceRateLimit,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { isValidUuid } from "@/lib/security/validate";

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
    .select("id, profile_id, name, status, photo_url")
    .eq("id", id)
    .maybeSingle();

  if (!driver) {
    return secureJsonResponse({ error: "Driver tidak ditemukan" }, { status: 404 });
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
