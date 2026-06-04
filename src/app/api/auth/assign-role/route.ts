import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/types/database";

const ALLOWED_SELF_ASSIGN: UserRole[] = ["merchant", "customer"];

/**
 * Tetapkan peran profil setelah daftar (server, service role).
 * Hanya merchant | customer — admin tidak bisa self-assign.
 */
export async function POST(req: Request) {
  try {
    const { role } = (await req.json()) as { role?: UserRole };
    if (!role || !ALLOWED_SELF_ASSIGN.includes(role)) {
      return NextResponse.json({ error: "Peran tidak valid" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Belum login" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { error } = await admin.from("profiles").upsert({
      id: user.id,
      email: user.email,
      name: user.user_metadata?.name ?? user.email?.split("@")[0] ?? "",
      role,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, role });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal assign role" },
      { status: 500 }
    );
  }
}
