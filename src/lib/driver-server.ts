import { createClient as createSupabaseJs } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Driver } from "@/types/database";

async function resolveDriver(userId: string): Promise<
  { userId: string; driver: Driver } | { error: string; status: number }
> {
  const supabase = createAdminClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profile?.role !== "driver") {
    return { error: "Bukan akun driver", status: 403 };
  }

  const { data: driver } = await supabase
    .from("drivers")
    .select("*")
    .eq("profile_id", userId)
    .maybeSingle();

  if (!driver) {
    return { error: "Profil driver belum terhubung", status: 404 };
  }

  return { userId, driver: driver as Driver };
}

export async function getAuthDriver(): Promise<
  { userId: string; driver: Driver } | { error: string; status: number }
> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return { error: "Belum login", status: 401 };
  }

  return resolveDriver(session.user.id);
}

/** Cookie (web) atau Bearer token (APK native toolbar). */
export async function getAuthDriverFromRequest(
  req?: Request
): Promise<{ userId: string; driver: Driver } | { error: string; status: number }> {
  const bearer = req?.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();

  if (bearer) {
    const client = createSupabaseJs(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data, error } = await client.auth.getUser(bearer);
    if (error || !data.user) {
      return { error: "Token tidak valid", status: 401 };
    }
    return resolveDriver(data.user.id);
  }

  return getAuthDriver();
}
