import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin-server";
import {
  enforceMethod,
  enforceRateLimit,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { isValidUuid } from "@/lib/security/validate";

const BUCKET = "driver-avatars";

export async function POST(req: Request) {
  const methodBlock = enforceMethod(req, ["POST"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "admin-driver-photo", RATE_LIMITS.apiWrite);
  if (rl) return rl;

  const auth = await requireAdmin();
  if ("error" in auth) {
    return secureJsonResponse({ error: auth.error }, { status: auth.status });
  }

  try {
    const form = await req.formData();
    const driverId = form.get("driverId")?.toString();
    const file = form.get("file");

    if (!driverId || !isValidUuid(driverId)) {
      return secureJsonResponse({ error: "driverId tidak valid" }, { status: 400 });
    }
    if (!(file instanceof Blob) || file.size === 0) {
      return secureJsonResponse({ error: "File foto wajib" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: driver } = await admin
      .from("drivers")
      .select("id")
      .eq("id", driverId)
      .maybeSingle();

    if (!driver) {
      return secureJsonResponse({ error: "Driver tidak ditemukan" }, { status: 404 });
    }

    const ext = form.get("ext")?.toString() === "jpg" ? "jpg" : "webp";
    const contentType = file.type || (ext === "jpg" ? "image/jpeg" : "image/webp");
    const path = `${driverId}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, buffer, {
      upsert: true,
      contentType,
      cacheControl: "31536000",
    });

    if (uploadError) {
      return secureJsonResponse(
        {
          error: uploadError.message,
          hint: "Pastikan bucket driver-avatars ada di Supabase Storage",
        },
        { status: 500 }
      );
    }

    const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(path);
    const photoUrl = `${urlData.publicUrl}?v=${Date.now()}`;

    const { error: updateError } = await admin
      .from("drivers")
      .update({ photo_url: photoUrl })
      .eq("id", driverId);

    if (updateError) {
      return secureJsonResponse({ error: updateError.message }, { status: 500 });
    }

    return secureJsonResponse({
      ok: true,
      photoUrl,
      bytes: buffer.length,
    });
  } catch (e) {
    return secureJsonResponse(
      { error: e instanceof Error ? e.message : "Gagal mengunggah foto" },
      { status: 500 }
    );
  }
}
