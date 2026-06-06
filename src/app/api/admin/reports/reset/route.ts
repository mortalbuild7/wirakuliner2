import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-server";
import { deleteAllOrders } from "@/lib/admin-delete-ops";
import {
  enforceMethod,
  enforceRateLimit,
  readJsonBody,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

const CONFIRM_PHRASE = "RESET LAPORAN";

/** Hapus semua data pesanan — reset laporan keuangan platform. */
export async function POST(req: Request) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "admin-reports-reset", RATE_LIMITS.adminWrite);
  if (rl) return rl;

  const auth = await requireAdmin();
  if ("error" in auth) {
    return secureJsonResponse({ error: auth.error }, { status: auth.status });
  }

  const parsed = await readJsonBody<{ confirm?: string }>(req);
  if ("error" in parsed) return parsed.error;

  if (parsed.data.confirm?.trim() !== CONFIRM_PHRASE) {
    return secureJsonResponse(
      { error: `Ketik "${CONFIRM_PHRASE}" untuk konfirmasi` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  try {
    const { deletedOrders } = await deleteAllOrders(admin);
    return secureJsonResponse({
      ok: true,
      message: `Laporan direset. ${deletedOrders} pesanan dihapus.`,
      deletedOrders,
    });
  } catch (e) {
    return secureJsonResponse(
      { error: e instanceof Error ? e.message : "Gagal reset laporan" },
      { status: 500 }
    );
  }
}
