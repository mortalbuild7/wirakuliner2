"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { optimizeAvatarImage } from "@/lib/optimize-avatar-image";
import { formatBytes } from "@/lib/optimize-menu-image";
import { Camera, ImageIcon, Loader2, User } from "lucide-react";

export type DriverPhotoDraft = {
  blob: Blob;
  ext: "webp" | "jpg";
  previewUrl: string;
};

type Props = {
  value: DriverPhotoDraft | null;
  onChange: (draft: DriverPhotoDraft | null) => void;
  disabled?: boolean;
};

export function DriverPhotoPicker({ value, onChange, disabled }: Props) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setHint(null);
    setBusy(true);
    try {
      const optimized = await optimizeAvatarImage(file);
      const previewUrl = URL.createObjectURL(optimized.blob);
      if (value?.previewUrl) URL.revokeObjectURL(value.previewUrl);
      onChange({
        blob: optimized.blob,
        ext: optimized.ext,
        previewUrl,
      });
      setHint(
        `${formatBytes(optimized.originalBytes)} → ${formatBytes(optimized.optimizedBytes)}`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memproses foto");
    } finally {
      setBusy(false);
      if (galleryRef.current) galleryRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    }
  }

  function clearPhoto() {
    if (value?.previewUrl) URL.revokeObjectURL(value.previewUrl);
    onChange(null);
    setHint(null);
    setError(null);
  }

  return (
    <div className="sm:col-span-2">
      <Label>Foto driver</Label>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Ditampilkan di lacak pesanan customer. Ambil foto langsung atau pilih dari galeri.
      </p>

      <div className="mt-3 flex flex-wrap items-start gap-4">
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => galleryRef.current?.click()}
          className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full border-2 border-dashed border-emerald-500/40 bg-muted/30 transition hover:border-emerald-500/70"
        >
          {value?.previewUrl ? (
            <Image
              src={value.previewUrl}
              alt="Preview foto driver"
              fill
              className="object-cover"
              sizes="96px"
              unoptimized
            />
          ) : (
            <span className="flex h-full w-full flex-col items-center justify-center text-muted-foreground">
              {busy ? (
                <Loader2 className="h-6 w-6 animate-spin text-emerald-500" />
              ) : (
                <>
                  <User className="h-7 w-7" />
                  <span className="mt-1 text-[9px]">Belum ada</span>
                </>
              )}
            </span>
          )}
        </button>

        <div className="flex min-w-[160px] flex-1 flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || busy}
            onClick={() => cameraRef.current?.click()}
          >
            <Camera className="mr-2 h-4 w-4" />
            Ambil foto
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || busy}
            onClick={() => galleryRef.current?.click()}
          >
            <ImageIcon className="mr-2 h-4 w-4" />
            Dari galeri / lokal
          </Button>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-red-500"
              disabled={disabled || busy}
              onClick={clearPhoto}
            >
              Hapus foto
            </Button>
          )}
        </div>
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />

      {hint && !error && <p className="mt-2 text-[10px] text-emerald-600">Dioptimasi: {hint}</p>}
      {error && <p className="mt-2 text-[10px] text-red-500">{error}</p>}
    </div>
  );
}

/** Upload draft foto setelah driver dibuat. */
export async function uploadDriverPhoto(driverId: string, draft: DriverPhotoDraft) {
  const body = new FormData();
  body.append("driverId", driverId);
  body.append("file", draft.blob, `avatar.${draft.ext}`);
  body.append("ext", draft.ext);

  const res = await fetch("/api/admin/drivers/photo", {
    method: "POST",
    credentials: "include",
    body,
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string; photoUrl?: string };
  if (!res.ok) throw new Error(json.error ?? "Gagal mengunggah foto");
  return json.photoUrl as string;
}
