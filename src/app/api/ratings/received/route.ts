import { getRatingSummary, listReceivedReviews, type RatingTargetType } from "@/lib/ratings";
import { getAuthDriverFromRequest } from "@/lib/driver-server";
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
  const rl = enforceRateLimit(req, "ratings-received", RATE_LIMITS.api);
  if (rl) return rl;

  const admin = createAdminClient();
  const driverAuth = await getAuthDriverFromRequest(req);

  if (!("error" in driverAuth)) {
    const [reviews, summary] = await Promise.all([
      listReceivedReviews(admin, "driver", driverAuth.driver.id, 20, {
        maskCustomerIdentity: true,
      }),
      getRatingSummary(admin, "driver", driverAuth.driver.id),
    ]);

    return secureJsonResponse({
      ok: true,
      role: "driver",
      summary,
      reviews,
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

  if (profile?.role !== "merchant") {
    return secureJsonResponse({ error: "Akses ditolak" }, { status: 403 });
  }

  const { data: merchant } = await supabase
    .from("merchants")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!merchant) {
    return secureJsonResponse({ error: "Merchant tidak ditemukan" }, { status: 404 });
  }

  const targetType: RatingTargetType = "merchant";
  const [reviews, summary] = await Promise.all([
    listReceivedReviews(admin, targetType, merchant.id),
    getRatingSummary(admin, targetType, merchant.id),
  ]);

  return secureJsonResponse({
    ok: true,
    role: "merchant",
    summary,
    reviews,
  });
}
