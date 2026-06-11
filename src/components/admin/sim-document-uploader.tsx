"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { CheckCircle2, FileUp, Loader2, Trash2 } from "lucide-react";

/** Batas ukuran foto SIM — cukup untuk foto kamera HP tanpa membebani bucket. */
const MAX_SIM_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

/** Tipe gambar yang diterima sebagai bukti fisik SIM. */
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

type Props = {
  /** Public URL dokumen SIM yang sudah terunggah (state milik form induk). */
  value: string | null;
  /** Setter state `simDocumentUrl` di form induk. */
  onChange: (url: string | null) => void;
  disabled?: boolean;
};

/**
 * Uploader foto fisik SIM → Supabase Storage bucket 'driver-documents'.
 *
 * Alur operasional:
 * 1. Admin memilih file gambar (jpeg/png/webp, maks 5 MB).
 * 2. File diunggah ke path acak `sim/{timestamp}-{uuid}.{ext}` — nama acak
 *    mencegah tabrakan & tebakan URL antar pendaftaran.
 * 3. Public URL diambil via `getPublicUrl` lalu di-set ke state induk
 *    `simDocumentUrl` — dikirim ke Server Action saat submit.
 *
 * Keamanan: kebijakan bucket hanya mengizinkan upload oleh user
 * terotentikasi (sesi admin), dan Server Action memvalidasi ulang bahwa
 * URL benar-benar berasal dari bucket 'driver-documents'.
 */
export function SimDocumentUploader({ value, onChange, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);

    // Validasi sisi client — cepat gagal sebelum menyentuh jaringan.
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError("Format harus JPG, PNG, atau WEBP");
      return;
    }
    if (file.size > MAX_SIM_FILE_BYTES) {
      setError("Ukuran foto SIM maksimal 5 MB");
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      // Path acak: anti-tabrakan + tidak bisa ditebak pihak luar.
      const path = `sim/${Date.now()}-${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("driver-documents")
        .upload(path, file, { contentType: file.type, upsert: false });

      if (upErr) {
        setError(upErr.message);
        return;
      }

      // Public URL — disimpan ke kolom drivers.sim_document_url oleh server.
      const { data } = supabase.storage.from("driver-documents").getPublicUrl(path);
      onChange(data.publicUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengunggah dokumen SIM");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="sm:col-span-2">
      <Label>Foto fisik SIM (wajib)</Label>
      <p className="mt-0.5 text-xs text-slate-500">
        Unggah foto SIM asli yang jelas terbaca — disimpan di bucket{" "}
        <code className="text-[10px]">driver-documents</code>.
      </p>

      <div className="mt-3 flex flex-wrap items-start gap-4">
        {/* Pratinjau dokumen yang sudah terunggah */}
        <div className="relative h-24 w-36 shrink-0 overflow-hidden rounded-lg border-2 border-dashed border-emerald-500/40 bg-muted/30">
          {value ? (
            <Image
              src={value}
              alt="Pratinjau dokumen SIM"
              fill
              className="object-cover"
              sizes="144px"
              unoptimized
            />
          ) : (
            <span className="flex h-full w-full flex-col items-center justify-center text-slate-500">
              {busy ? (
                <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
              ) : (
                <>
                  <FileUp className="h-6 w-6" />
                  <span className="mt-1 text-[9px]">Belum ada dokumen</span>
                </>
              )}
            </span>
          )}
        </div>

        <div className="flex min-w-[160px] flex-1 flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileUp className="mr-2 h-4 w-4" />
            )}
            {value ? "Ganti foto SIM" : "Unggah foto SIM"}
          </Button>

          {value && (
            <>
              <p className="inline-flex items-center gap-1 text-[11px] text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Dokumen terunggah & siap disimpan
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-fit text-red-500"
                disabled={disabled || busy}
                onClick={() => onChange(null)}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Hapus
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Input file tersembunyi — dipicu tombol agar UI konsisten Tailwind */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />

      {error && <p className="mt-2 text-[10px] text-red-500">{error}</p>}
    </div>
  );
}
