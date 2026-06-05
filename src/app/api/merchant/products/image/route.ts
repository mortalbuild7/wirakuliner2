import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "menu-images";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const productId = form.get("productId")?.toString();
    const file = form.get("file");

    if (!productId || !(file instanceof Blob) || file.size === 0) {
      return NextResponse.json({ error: "productId dan file wajib" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Belum login" }, { status: 401 });
    }

    const { data: product } = await supabase
      .from("products")
      .select("id, merchant_id")
      .eq("id", productId)
      .single();

    if (!product) {
      return NextResponse.json({ error: "Produk tidak ditemukan" }, { status: 404 });
    }

    const { data: merchantRow } = await supabase
      .from("merchants")
      .select("owner_id")
      .eq("id", product.merchant_id)
      .single();

    if (!merchantRow || merchantRow.owner_id !== user.id) {
      return NextResponse.json({ error: "Tidak diizinkan" }, { status: 403 });
    }

    const ext = form.get("ext")?.toString() === "jpg" ? "jpg" : "webp";
    const contentType = file.type || (ext === "jpg" ? "image/jpeg" : "image/webp");
    const path = `${product.merchant_id}/${productId}.${ext}`;

    const admin = createAdminClient();
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, buffer, {
      upsert: true,
      contentType,
      cacheControl: "31536000",
    });

    if (uploadError) {
      return NextResponse.json(
        {
          error: uploadError.message,
          hint: "Pastikan bucket menu-images ada di Supabase Storage",
        },
        { status: 500 }
      );
    }

    const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(path);
    const imageUrl = `${urlData.publicUrl}?v=${Date.now()}`;

    const { error: updateError } = await admin
      .from("products")
      .update({ image_url: imageUrl })
      .eq("id", productId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Sinkron ke etalase customer (kartu toko di home)
    await admin
      .from("merchants")
      .update({ image_url: imageUrl })
      .eq("id", product.merchant_id);

    return NextResponse.json({
      ok: true,
      imageUrl,
      path,
      bytes: buffer.length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Gagal mengunggah gambar" },
      { status: 500 }
    );
  }
}
