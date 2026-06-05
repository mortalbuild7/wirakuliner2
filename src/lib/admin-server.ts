import { createClient } from "@/lib/supabase/server";

export async function requireAdmin(): Promise<
  { userId: string } | { error: string; status: number }
> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Belum login", status: 401 };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return { error: "Hanya admin yang boleh mengakses", status: 403 };
  }

  return { userId: user.id };
}
