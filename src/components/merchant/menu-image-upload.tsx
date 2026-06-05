"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { optimizeMenuImage, formatBytes } from "@/lib/optimize-menu-image";
import { Camera, ImageIcon, Loader2 } from "lucide-react";

type Props = {
  productId: string;
  currentUrl?: string | null;
  onUploaded: (url: string) => void;
  compact?: boolean;
};

export function MenuImageUpload({ productId, currentUrl, onUploaded, compact }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const displayUrl = preview ?? currentUrl ?? null;

  async function handleFile(file: File) {
    setError(null);
    setHint(null);
    setUploading(true);
    try {
      const optimized = await optimizeMenuImage(file);
      const localPreview = URL.createObjectURL(optimized.blob);
      setPreview(localPreview);
      setHint(
        `${formatBytes(optimized.originalBytes)} → ${formatBytes(optimized.optimizedBytes)} · ${optimized.width}×${optimized.height} ${optimized.ext.toUpperCase()}`
      );

      const body = new FormData();
      body.append("productId", productId);
      body.append("file", optimized.blob, `menu.${optimized.ext}`);
      body.append("ext", optimized.ext);

      const res = await fetch("/api/merchant/products/image", {
        method: "POST",
        body,
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? "Upload gagal");
      }
      onUploaded(json.imageUrl as string);
      setPreview(null);
      URL.revokeObjectURL(localPreview);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengunggah");
      setPreview(null);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className={cn("flex flex-col gap-2", compact ? "items-center" : "")}>
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "relative overflow-hidden rounded-xl border border-dashed border-white/20 bg-white/5 transition hover:border-orange-500/50 hover:bg-white/10",
          compact ? "h-16 w-16 shrink-0" : "h-28 w-full max-w-[140px]"
        )}
      >
        {displayUrl ? (
          <Image
            src={displayUrl}
            alt="Foto menu"
            fill
            className="object-cover"
            sizes={compact ? "64px" : "140px"}
            unoptimized={!!preview}
          />
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin text-orange-400" />
            ) : (
              <>
                <ImageIcon className="h-5 w-5" />
                {!compact && <span className="text-[10px]">Tambah foto</span>}
              </>
            )}
          </span>
        )}
        {uploading && displayUrl && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="h-6 w-6 animate-spin text-white" />
          </span>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />

      {!compact && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full max-w-[140px] rounded-xl border-white/15 text-xs"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          <Camera className="mr-1.5 h-3.5 w-3.5" />
          {displayUrl ? "Ganti foto" : "Upload foto menu"}
        </Button>
      )}

      {hint && !error && (
        <p className="text-[10px] text-emerald-400/90">Dioptimasi: {hint}</p>
      )}
      {error && <p className="text-[10px] text-red-400">{error}</p>}
      {!compact && !error && (
        <p className="max-w-[200px] text-[10px] leading-snug text-muted-foreground">
          Otomatis resize & WebP — tajam di HP, ringan untuk app
        </p>
      )}
    </div>
  );
}
