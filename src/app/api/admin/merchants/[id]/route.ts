import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-server";
import { deleteAuthUser, deleteOrdersForMerchant } from "@/lib/admin-delete-ops";
import {
  enforceMethod,
  enforceRateLimit,
  readJsonBody,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { isValidUuid, sanitizeText } from "@/lib/security/validate";

const MERCHANT_ACTIONS = [
  "suspend",
  "unsuspend",
  "force_close",
  "disconnect",
  "activate",
  "approve",
  "reject",
] as const;

type MerchantAction = (typeof MERCHANT_ACTIONS)[number];

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const methodBlock = enforceMethod(req, ["PATCH"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "admin-merchant-action", RATE_LIMITS.api);
  if (rl) return rl;

  const auth = await requireAdmin();
  if ("error" in auth) {
    return secureJsonResponse({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  if (!isValidUuid(id)) {
    return secureJsonResponse({ error: "ID toko tidak valid" }, { status: 400 });
  }

  const parsed = await readJsonBody<{ action?: MerchantAction; note?: string }>(req);
  if ("error" in parsed) return parsed.error;

  const action = parsed.data.action;
  const note = sanitizeText(parsed.data.note, 500);

  if (!action || !MERCHANT_ACTIONS.includes(action)) {
    return secureJsonResponse({ error: "Aksi tidak valid" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: merchant, error: fetchErr } = await admin
    .from("merchants")
    .select("id, owner_id, name, is_active, is_open, admin_suspended, approval_status")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !merchant) {
    return secureJsonResponse({ error: "Toko tidak ditemukan" }, { status: 404 });
  }

  let patch: Record<string, unknown> = {};

  switch (action) {
    case "suspend":
      patch = {
        admin_suspended: true,
        is_active: false,
        is_open: false,
        admin_note: note ?? "Disuspend oleh admin",
      };
      break;
    case "unsuspend":
      patch = {
        admin_suspended: false,
        is_active: true,
        admin_note: note ?? null,
      };
      break;
    case "force_close":
      patch = {
        is_open: false,
        admin_note: note ?? "Ditutup paksa oleh admin",
      };
      break;
    case "disconnect":
      patch = {
        owner_id: null,
        admin_suspended: true,
        is_active: false,
        is_open: false,
        admin_note: note ?? "Hubungan mitra diputus admin",
      };
      break;
    case "activate":
      if (!merchant.owner_id) {
        return secureJsonResponse(
          { error: "Toko tidak punya pemilik — tidak bisa diaktifkan" },
          { status: 400 }
        );
      }
      patch = {
        admin_suspended: false,
        is_active: true,
        approval_status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: auth.userId,
        rejection_note: null,
        admin_note: note ?? null,
      };
      break;
    case "approve":
      if (!merchant.owner_id) {
        return secureJsonResponse(
          { error: "Toko tidak punya pemilik — tidak bisa disetujui" },
          { status: 400 }
        );
      }
      patch = {
        approval_status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: auth.userId,
        rejection_note: null,
        admin_suspended: false,
        is_active: true,
        admin_note: note ?? null,
      };
      break;
    case "reject":
      patch = {
        approval_status: "rejected",
        approved_at: null,
        approved_by: auth.userId,
        rejection_note: note ?? "Pendaftaran ditolak admin",
        is_active: false,
        is_open: false,
      };
      break;
  }

  const { error: updateErr } = await admin.from("merchants").update(patch).eq("id", id);

  if (updateErr) {
    return secureJsonResponse({ error: updateErr.message }, { status: 500 });
  }

  return secureJsonResponse({ ok: true, action, merchantId: id });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const methodBlock = enforceMethod(req, ["DELETE"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "admin-merchant-delete", RATE_LIMITS.adminWrite);
  if (rl) return rl;

  const auth = await requireAdmin();
  if ("error" in auth) {
    return secureJsonResponse({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  if (!isValidUuid(id)) {
    return secureJsonResponse({ error: "ID toko tidak valid" }, { status: 400 });
  }

  const parsed = await readJsonBody<{ delete_owner?: boolean }>(req);
  const deleteOwner = "error" in parsed ? true : parsed.data.delete_owner !== false;

  const admin = createAdminClient();
  const { data: merchant } = await admin
    .from("merchants")
    .select("id, owner_id, name")
    .eq("id", id)
    .maybeSingle();

  if (!merchant) {
    return secureJsonResponse({ error: "Toko tidak ditemukan" }, { status: 404 });
  }

  const { count: activeOrders } = await admin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("merchant_id", id)
    .in("order_status", ["paid", "preparing", "ready_for_pickup", "on_the_way"]);

  if (activeOrders && activeOrders > 0) {
    return secureJsonResponse(
      { error: "Toko masih punya pesanan aktif — selesaikan atau batalkan dulu" },
      { status: 400 }
    );
  }

  try {
    await deleteOrdersForMerchant(admin, id);
    const ownerId = merchant.owner_id;
    const { error: delErr } = await admin.from("merchants").delete().eq("id", id);
    if (delErr) throw new Error(delErr.message);

    if (deleteOwner && ownerId) {
      await deleteAuthUser(admin, ownerId);
    }

    return secureJsonResponse({
      ok: true,
      deletedMerchantId: id,
      deletedOwner: Boolean(deleteOwner && ownerId),
    });
  } catch (e) {
    return secureJsonResponse(
      { error: e instanceof Error ? e.message : "Gagal menghapus toko" },
      { status: 500 }
    );
  }
}
