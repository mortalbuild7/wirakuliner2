import { createClient } from "@/lib/supabase/server";
import {
  assertResourceOwner,
  rejectTrustedOwnerIdsInBody,
} from "@/lib/security/auth-owner";
import {
  enforceMethod,
  enforceRateLimit,
  readJsonBody,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { parsePagination, toSupabaseRange } from "@/lib/security/pagination";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { sanitizeDescription, sanitizeName } from "@/lib/security/sanitize";
import { parseBoundedNumber } from "@/lib/security/validate";

async function getMerchantForUser(userId: string) {
  const supabase = await createClient();
  const { data: merchant } = await supabase
    .from("merchants")
    .select("id, owner_id")
    .eq("owner_id", userId)
    .maybeSingle();
  return merchant;
}

/** List produk merchant — pagination ketat. */
export async function GET(req: Request) {
  const methodBlock = enforceMethod(req, ["GET"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "merchant-products-list", RATE_LIMITS.api);
  if (rl) return rl;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return secureJsonResponse({ error: "Belum login" }, { status: 401 });
  }

  const merchant = await getMerchantForUser(user.id);
  if (!merchant) {
    return secureJsonResponse({ error: "Merchant tidak ditemukan" }, { status: 404 });
  }

  const pagination = parsePagination(new URL(req.url).searchParams);
  const { from, to } = toSupabaseRange(pagination);

  const { data, error, count } = await supabase
    .from("products")
    .select("id, name, description, price, image_url, is_available, created_at", {
      count: "exact",
    })
    .eq("merchant_id", merchant.id)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    return secureJsonResponse({ error: error.message }, { status: 500 });
  }

  return secureJsonResponse({
    ok: true,
    items: data ?? [],
    total: count ?? 0,
    ...pagination,
  });
}

/** Tambah produk — sanitasi XSS pada nama & deskripsi. */
export async function POST(req: Request) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "merchant-products-create", RATE_LIMITS.apiWrite);
  if (rl) return rl;

  const parsed = await readJsonBody<{
    name?: string;
    description?: string;
    price?: number;
    owner_id?: string;
    merchant_id?: string;
  }>(req);
  if ("error" in parsed) return parsed.error;

  const idorBlock = rejectTrustedOwnerIdsInBody(parsed.data as Record<string, unknown>);
  if (idorBlock) return idorBlock;

  const name = sanitizeName(parsed.data.name);
  const description = sanitizeDescription(parsed.data.description) ?? "";
  const price = parseBoundedNumber(parsed.data.price, 0, 50_000_000);

  if (!name) {
    return secureJsonResponse({ error: "Nama produk tidak valid" }, { status: 400 });
  }
  if (price == null) {
    return secureJsonResponse({ error: "Harga tidak valid" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return secureJsonResponse({ error: "Belum login" }, { status: 401 });
  }

  const merchant = await getMerchantForUser(user.id);
  if (!merchant) {
    return secureJsonResponse({ error: "Merchant tidak ditemukan" }, { status: 404 });
  }

  const ownerCheck = assertResourceOwner(merchant.owner_id, user.id, "toko");
  if (ownerCheck) return ownerCheck;

  const { data: row, error } = await supabase
    .from("products")
    .insert({
      merchant_id: merchant.id,
      name,
      description,
      price,
      is_available: true,
    })
    .select("id, name, price, description, is_available")
    .single();

  if (error || !row) {
    return secureJsonResponse({ error: error?.message ?? "Gagal menambah produk" }, { status: 500 });
  }

  return secureJsonResponse({ ok: true, product: row });
}
