import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      name?: string;
      address?: string;
      description?: string;
      category?: string;
      latitude?: number;
      longitude?: number;
    };

    const { name, address, description, category, latitude, longitude } = body;
    if (!name?.trim() || !address?.trim()) {
      return NextResponse.json({ error: "Nama toko dan alamat wajib diisi" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Belum login. Silakan masuk ulang." }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "merchant") {
      return NextResponse.json(
        { error: "Akun ini bukan merchant. Daftar di /register?role=merchant" },
        { status: 403 }
      );
    }

    const { data: existing } = await supabase
      .from("merchants")
      .select("id")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ ok: true, merchantId: existing.id, alreadyExists: true });
    }

    const { data: merchant, error } = await supabase
      .from("merchants")
      .insert({
        owner_id: user.id,
        name: name.trim(),
        address: address.trim(),
        description: description?.trim() ?? "",
        category: category ?? "makanan",
        latitude: latitude ?? -5.1348,
        longitude: longitude ?? 119.4065,
        is_active: true,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, merchantId: merchant.id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal menyimpan toko" },
      { status: 500 }
    );
  }
}
