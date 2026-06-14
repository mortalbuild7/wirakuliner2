"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { MapPinned, X } from "lucide-react";
import { cn } from "@/lib/utils";

type CustomerMapSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

export function CustomerMapSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
}: CustomerMapSheetProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="customer-map-sheet fixed inset-0 z-[2147483640] flex flex-col bg-white"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-sm">
        <div className="mx-auto flex max-w-mobile items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <MapPinned className="h-4 w-4 shrink-0 text-emerald-600" />
              {title}
            </p>
            {subtitle ? (
              <p className="mt-1 text-[11px] font-medium text-slate-600">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200",
              "bg-white text-slate-700 shadow-sm active:scale-95"
            )}
            aria-label="Tutup peta"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="customer-map-sheet-body relative min-h-0 flex-1 overflow-hidden bg-slate-50">
        {children}
      </div>

      <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onClose}
          className="mx-auto flex w-full max-w-mobile items-center justify-center rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-md active:scale-[0.99]"
        >
          Selesai
        </button>
      </div>
    </div>,
    document.body
  );
}

function staticMapPreviewUrl(lat: number, lng: number, w = 640, h = 220) {
  const center = `${lat},${lng}`;
  const marker = `${lat},${lng},lightgreen1`;
  return `https://staticmap.openstreetmap.de/staticmap.php?center=${center}&zoom=15&size=${w}x${h}&maptype=mapnik&markers=${marker}`;
}

export function CustomerMapPreviewButton({
  lat,
  lng,
  label,
  onOpen,
  ringClass = "ring-emerald-500/30",
}: {
  lat: number;
  lng: number;
  label: string;
  onOpen: () => void;
  ringClass?: string;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group relative w-full overflow-hidden rounded-2xl ring-1",
        ringClass,
        "text-left transition active:scale-[0.99]"
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={staticMapPreviewUrl(lat, lng)}
        alt={label}
        className="block h-[160px] w-full object-cover"
        loading="lazy"
        decoding="async"
      />
      <div className="absolute inset-0 flex items-end bg-gradient-to-t from-slate-900/55 to-transparent p-3">
        <span className="rounded-full bg-white/95 px-3 py-1.5 text-[11px] font-bold text-emerald-800 shadow">
          {label}
        </span>
      </div>
    </button>
  );
}
