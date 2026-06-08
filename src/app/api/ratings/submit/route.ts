import { submitOrderRating, type RatingTargetType } from "@/lib/ratings";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  enforceMethod,
  enforceRateLimit,
  readJsonBody,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { sanitizePublicText } from "@/lib/security/sanitize";
import { isValidUuid } from "@/lib/security/validate";

export async function POST(req: Request) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "ratings-submit", RATE_LIMITS.apiWrite);
  if (rl) return rl;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return secureJsonResponse({ error: "Silakan login" }, { status: 401 });
  }

  const parsed = await readJsonBody<{
    orderId?: string;
    targetType?: string;
    rating?: number;
    comment?: string;
  }>(req);
  if ("error" in parsed) return parsed.error;

  const orderId = parsed.data.orderId;
  const targetType = parsed.data.targetType as RatingTargetType | undefined;
  const rating = Number(parsed.data.rating);

  if (!isValidUuid(orderId)) {
    return secureJsonResponse({ error: "orderId tidak valid" }, { status: 400 });
  }
  if (!targetType || !["driver", "merchant"].includes(targetType)) {
    return secureJsonResponse(
      { error: "targetType wajib driver atau merchant" },
      { status: 400 }
    );
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return secureJsonResponse(
      { error: "Rating harus 1–5" },
      { status: 400 }
    );
  }

  const comment = sanitizePublicText(parsed.data.comment, 500);

  try {
    const admin = createAdminClient();
    const row = await submitOrderRating(admin, {
      orderId: orderId!,
      customerId: user.id,
      targetType,
      rating,
      comment: comment ?? undefined,
    });

    return secureJsonResponse({ ok: true, rating: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal menyimpan rating";
    const status = msg.includes("tidak ditemukan") ? 404 : 400;
    return secureJsonResponse({ error: msg }, { status });
  }
}
