import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-server";
import {
  enforceMethod,
  enforceRateLimit,
  readJsonBody,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { isValidUuid, sanitizeText } from "@/lib/security/validate";

const CUSTOMER_ACTIONS = ["warn", "suspend", "block", "restore"] as const;

type CustomerAction = (typeof CUSTOMER_ACTIONS)[number];

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const methodBlock = enforceMethod(req, ["PATCH"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "admin-customer-action", RATE_LIMITS.api);
  if (rl) return rl;

  const auth = await requireAdmin();
  if ("error" in auth) {
    return secureJsonResponse({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  if (!isValidUuid(id)) {
    return secureJsonResponse({ error: "ID customer tidak valid" }, { status: 400 });
  }

  const parsed = await readJsonBody<{
    action?: CustomerAction;
    note?: string;
    suspended_days?: number;
  }>(req);

  if ("error" in parsed) return parsed.error;

  const action = parsed.data.action;
  const note = sanitizeText(parsed.data.note, 500);

  if (!action || !CUSTOMER_ACTIONS.includes(action)) {
    return secureJsonResponse({ error: "Aksi tidak valid" }, { status: 400 });
  }

  if ((action === "warn" || action === "suspend" || action === "block") && !note) {
    return secureJsonResponse({ error: "Catatan/peringatan wajib diisi" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: profile, error: fetchErr } = await admin
    .from("profiles")
    .select("id, role, name")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !profile) {
    return secureJsonResponse({ error: "Customer tidak ditemukan" }, { status: 404 });
  }

  if (profile.role !== "customer") {
    return secureJsonResponse({ error: "Akun bukan customer" }, { status: 400 });
  }

  let patch: Record<string, unknown> = {};

  switch (action) {
    case "warn":
      patch = {
        account_status: "warned",
        admin_note: note,
        warned_at: new Date().toISOString(),
        suspended_until: null,
      };
      break;
    case "suspend": {
      const days =
        typeof parsed.data.suspended_days === "number" && parsed.data.suspended_days > 0
          ? Math.min(parsed.data.suspended_days, 365)
          : 7;
      const until = new Date();
      until.setDate(until.getDate() + days);
      patch = {
        account_status: "suspended",
        admin_note: note,
        suspended_until: until.toISOString(),
      };
      break;
    }
    case "block":
      patch = {
        account_status: "blocked",
        admin_note: note,
        suspended_until: null,
      };
      break;
    case "restore":
      patch = {
        account_status: "active",
        admin_note: note ?? null,
        warned_at: null,
        suspended_until: null,
      };
      break;
  }

  const { error: updateErr } = await admin.from("profiles").update(patch).eq("id", id);

  if (updateErr) {
    return secureJsonResponse({ error: updateErr.message }, { status: 500 });
  }

  return secureJsonResponse({ ok: true, action, customerId: id });
}
