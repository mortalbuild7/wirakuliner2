"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { UtensilsCrossed } from "lucide-react";

type Props = {
  src?: string | null;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
};

/** Gambar menu dari merchant — dipakai di etalase & keranjang customer */
export function ProductMenuImage({
  src,
  alt,
  className,
  sizes = "120px",
  priority = false,
}: Props) {
  if (!src?.trim()) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 text-muted-foreground",
          className
        )}
      >
        <UtensilsCrossed className="h-6 w-6 opacity-50" />
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      className={cn("object-cover", className)}
      sizes={sizes}
      loading={priority ? undefined : "lazy"}
      priority={priority}
    />
  );
}
