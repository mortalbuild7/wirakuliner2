import { topupWallet } from "@/lib/wallet";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  enforceMethod,
  enforceRateLimit,
  readJsonBody,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { parseBoundedNumber } from "@/lib/security/validate";

export async function POST(req: Request) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "wallet-topup", RATE_LIMITS.apiWrite);
  if (rl) return rl;

  const parsed = await readJsonBody<{
    amount?: number;
    method?: string;
  }>(req);
  if ("error" in parsed) return parsed.error;

  const amount = parseBoundedNumber(parsed.data.amount, 10_000, 10_000_000);
  const method = parsed.data.method === "va_bank" ? "va_bank" : "ewallet";

  if (amount == null) {
    return secureJsonResponse(
      { error: "Nominal top up antara Rp 10.000 – Rp 10.000.000" },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return secureJsonResponse({ error: "Silakan login" }, { status: 401 });
  }

  const admin = createAdminClient();

  try {
    const { txId, balance } = await topupWallet(
      admin,
      "customer",
      user.id,
      amount,
      method
    );

    return secureJsonResponse({
      ok: true,
      txId,
      balance,
      method,
      message:
        method === "ewallet"
          ? "Top up E-Wallet berhasil"
          : "Top up Virtual Account berhasil",
    });
  } catch (e) {
    return secureJsonResponse(
      { error: e instanceof Error ? e.message : "Gagal top up" },
      { status: 400 }
    );
  }
}
