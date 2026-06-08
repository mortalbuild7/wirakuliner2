import { createClient } from "@/lib/supabase/server";
import {
  enforceMethod,
  enforceRateLimit,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { parsePagination, toSupabaseRange } from "@/lib/security/pagination";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { rejectIfSqlInjection } from "@/lib/security/validate";
import { sanitizePublicText } from "@/lib/security/sanitize";

/**
 * Pencarian restoran & menu — WAJIB pagination ketat.
 * Mencegah attacker meminta jutaan baris (CPU PostgreSQL 100%).
 */
export async function GET(req: Request) {
  const methodBlock = enforceMethod(req, ["GET"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "catalog-search", RATE_LIMITS.api);
  if (rl) return rl;

  const url = new URL(req.url);
  const pagination = parsePagination(url.searchParams, { defaultLimit: 24, maxLimit: 40 });

  const rawQ = url.searchParams.get("q") ?? "";
  const qCheck = rejectIfSqlInjection(rawQ, "q");
  if (typeof qCheck !== "string") {
    return secureJsonResponse({ error: qCheck.error }, { status: 400 });
  }
  const q = sanitizePublicText(qCheck, 100) ?? "";

  const category = sanitizePublicText(url.searchParams.get("category"), 40);
  const type = url.searchParams.get("type") === "products" ? "products" : "merchants";

  const supabase = await createClient();
  const { from, to } = toSupabaseRange(pagination);

  if (type === "products") {
    let query = supabase
      .from("products")
      .select(
        "id, name, price, image_url, merchant_id, is_available, merchants!inner(id, name, is_open, approval_status, admin_suspended, is_active)",
        { count: "exact" }
      )
      .eq("is_available", true)
      .eq("merchants.is_active", true)
      .eq("merchants.admin_suspended", false)
      .eq("merchants.approval_status", "approved");

    if (q) {
      query = query.ilike("name", `%${q}%`);
    }

    const { data, error, count } = await query
      .order("name", { ascending: true })
      .range(from, to);

    if (error) {
      return secureJsonResponse({ error: error.message }, { status: 500 });
    }

    return secureJsonResponse({
      ok: true,
      type: "products",
      q,
      items: data ?? [],
      total: count ?? 0,
      ...pagination,
    });
  }

  let query = supabase
    .from("merchants")
    .select("id, name, description, category, image_url, is_open, latitude, longitude", {
      count: "exact",
    })
    .eq("is_active", true)
    .eq("admin_suspended", false)
    .eq("approval_status", "approved");

  if (q) {
    query = query.ilike("name", `%${q}%`);
  }
  if (category && category !== "semua") {
    query = query.eq("category", category);
  }

  const { data, error, count } = await query
    .order("name", { ascending: true })
    .range(from, to);

  if (error) {
    return secureJsonResponse({ error: error.message }, { status: 500 });
  }

  return secureJsonResponse({
    ok: true,
    type: "merchants",
    q,
    category: category ?? "semua",
    items: data ?? [],
    total: count ?? 0,
    ...pagination,
  });
}
