import { resolveWalletOwner } from "@/lib/wallet-auth";
import { listWalletWithdrawals } from "@/lib/wallet";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  enforceMethod,
  enforceRateLimit,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

export async function GET(req: Request) {
  const methodBlock = enforceMethod(req, ["GET"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "wallet-withdrawals", RATE_LIMITS.api);
  if (rl) return rl;

  const owner = await resolveWalletOwner(req);
  if ("error" in owner) {
    return secureJsonResponse({ error: owner.error }, { status: owner.status });
  }

  const admin = createAdminClient();
  const withdrawals = await listWalletWithdrawals(
    admin,
    owner.ownerType,
    owner.ownerId
  );

  return secureJsonResponse({ ok: true, withdrawals });
}
