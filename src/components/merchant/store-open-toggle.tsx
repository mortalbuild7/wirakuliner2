"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { isStoreOpen, storeStatusLabel } from "@/lib/merchant-open";
import type { Merchant } from "@/types/database";
import { Loader2, Power, Store } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  merchant: Merchant;
  onChange?: (open: boolean) => void;
};

export function StoreOpenToggle({ merchant, onChange }: Props) {
  const [open, setOpen] = useState(isStoreOpen(merchant));
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function toggle() {
    if (merchant.admin_suspended) {
      alert("Toko disuspend admin. Hubungi operator WIRA Kuliner.");
      return;
    }
    setLoading(true);
    const next = !open;
    const { error } = await supabase
      .from("merchants")
      .update({ is_open: next })
      .eq("id", merchant.id);

    setLoading(false);
    if (error) {
      alert(error.message.includes("is_open") ? "Jalankan migrasi is_open di Supabase SQL Editor" : error.message);
      return;
    }
    setOpen(next);
    onChange?.(next);
  }

  return (
    <section
      className={cn(
        "glass-card overflow-hidden p-4 transition-colors",
        open ? "border-emerald-500/30" : "border-slate-500/40"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Store className="h-3.5 w-3.5" /> Status toko
          </p>
          <p className={cn("mt-1 text-xl font-bold", open ? "text-emerald-300" : "text-slate-400")}>
            {storeStatusLabel(open)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {open
              ? "Customer bisa pesan dari etalase & app."
              : "Customer hanya melihat menu — tidak bisa memesan."}
          </p>
        </div>
        <div
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-2xl",
            open ? "bg-emerald-500/20" : "bg-slate-500/20"
          )}
        >
          <Power className={cn("h-6 w-6", open ? "text-emerald-400" : "text-slate-500")} />
        </div>
      </div>
      {merchant.admin_suspended && (
        <p className="mt-3 text-xs font-medium text-red-400">
          Toko disuspend admin — tidak bisa dibuka.
        </p>
      )}
      <Button
        type="button"
        disabled={loading || merchant.admin_suspended}
        onClick={toggle}
        className={cn(
          "mt-4 h-12 w-full rounded-2xl font-semibold",
          open
            ? "bg-slate-700 text-white hover:bg-slate-600"
            : "bg-gradient-to-r from-emerald-500 to-cyan-600 text-slate-950"
        )}
      >
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : open ? (
          "Tutup toko"
        ) : (
          "Buka toko"
        )}
      </Button>
    </section>
  );
}
