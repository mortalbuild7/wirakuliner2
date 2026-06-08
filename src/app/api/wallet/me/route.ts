import { getAuthDriver } from "@/lib/driver-server";
import { getWalletBalance } from "@/lib/wallet";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  enforceMethod,
  enforceRateLimit,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

export async function GET(req: Request) {
  const methodBlock = enforceMethod(req, ["GET"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "wallet-me", RATE_LIMITS.api);
  if (rl) return rl;

  const admin = createAdminClient();

  const driverAuth = await getAuthDriver();
  if (!("error" in driverAuth)) {
    const balance = await getWalletBalance(admin, "driver", driverAuth.driver.id);
    return secureJsonResponse({
      ok: true,
      role: "driver",
      balance,
      ownerId: driverAuth.driver.id,
    });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return secureJsonResponse({ error: "Belum login" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role === "merchant") {
    const { data: merchant } = await supabase
      .from("merchants")
      .select("id")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (!merchant) {
      return secureJsonResponse({ error: "Merchant tidak ditemukan" }, { status: 404 });
    }

    const balance = await getWalletBalance(admin, "merchant", merchant.id);
    return secureJsonResponse({
      ok: true,
      role: "merchant",
      balance,
      ownerId: merchant.id,
    });
  }

  const balance = await getWalletBalance(admin, "customer", user.id);
  return secureJsonResponse({
    ok: true,
    role: "customer",
    balance,
    ownerId: user.id,
  });
}
