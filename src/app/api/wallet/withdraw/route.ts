import { resolveWalletOwner } from "@/lib/wallet-auth";
import { withdrawWallet, type WalletWithdrawMethod } from "@/lib/wallet";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  enforceMethod,
  enforceRateLimit,
  readJsonBody,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { parseBoundedNumber, sanitizeText } from "@/lib/security/validate";

export async function POST(req: Request) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "wallet-withdraw", RATE_LIMITS.apiWrite);
  if (rl) return rl;

  const owner = await resolveWalletOwner(req);
  if ("error" in owner) {
    return secureJsonResponse({ error: owner.error }, { status: owner.status });
  }

  const parsed = await readJsonBody<{
    amount?: number;
    method?: string;
    destination?: string;
    destinationName?: string;
  }>(req);
  if ("error" in parsed) return parsed.error;

  const amount = parseBoundedNumber(parsed.data.amount, 50_000, 50_000_000);
  const method: WalletWithdrawMethod =
    parsed.data.method === "va_bank" ? "va_bank" : "ewallet";
  const destination = sanitizeText(parsed.data.destination, 80)?.trim() ?? "";
  const destinationName = sanitizeText(parsed.data.destinationName, 120);

  if (amount == null) {
    return secureJsonResponse(
      { error: "Nominal penarikan antara Rp 50.000 – Rp 50.000.000" },
      { status: 400 }
    );
  }
  if (!destination || destination.length < 5) {
    return secureJsonResponse(
      {
        error:
          method === "ewallet"
            ? "Nomor E-Wallet wajib diisi (min. 5 karakter)"
            : "Nomor rekening bank wajib diisi",
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  try {
    const result = await withdrawWallet(
      admin,
      owner.ownerType,
      owner.ownerId,
      amount,
      method,
      destination,
      destinationName
    );

    return secureJsonResponse({
      ok: true,
      withdrawalId: result.withdrawalId,
      balance: result.balance,
      method,
      message:
        method === "ewallet"
          ? "Penarikan ke E-Wallet berhasil diproses"
          : "Penarikan ke rekening bank berhasil diproses",
    });
  } catch (e) {
    return secureJsonResponse(
      { error: e instanceof Error ? e.message : "Gagal menarik saldo" },
      { status: 400 }
    );
  }
}
