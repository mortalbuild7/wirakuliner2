"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle, Bell, Truck, X } from "lucide-react";
import {
  customerNotificationStore,
  type CustomerNotification,
  type CustomerNotificationKind,
} from "@/lib/customer-notifications";
import { cn } from "@/lib/utils";

function kindIcon(kind: CustomerNotificationKind) {
  if (kind === "chat") return MessageCircle;
  if (kind === "status" || kind === "driver") return Truck;
  return Bell;
}

function kindStyles(kind: CustomerNotificationKind) {
  if (kind === "chat") return "border-sky-200 bg-gradient-to-r from-sky-50 to-white";
  if (kind === "payment") return "border-amber-200 bg-gradient-to-r from-amber-50 to-white";
  return "border-emerald-200 bg-gradient-to-r from-emerald-50 to-white";
}

function kindAccent(kind: CustomerNotificationKind) {
  if (kind === "chat") return "bg-sky-600";
  if (kind === "payment") return "bg-amber-600";
  return "bg-emerald-600";
}

/**
 * Notifikasi popup slide dari atas layar HP — status order & chat driver.
 */
export function CustomerNotificationTray() {
  const [items, setItems] = useState<CustomerNotification[]>([]);

  useEffect(() => customerNotificationStore.subscribe(setItems), []);

  if (items.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] mx-auto flex max-w-mobile flex-col gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))]"
      aria-live="polite"
    >
      {items.map((item, index) => {
        const Icon = kindIcon(item.kind);
        return (
          <div
            key={item.id}
            className="pointer-events-auto animate-[wira-slide-down_0.35s_ease-out]"
            style={{ animationDelay: `${index * 40}ms` }}
          >
            <Link
              href={item.href}
              onClick={() => customerNotificationStore.dismiss(item.id)}
              className={cn(
                "flex items-start gap-3 rounded-2xl border p-3 shadow-lg shadow-slate-900/10 ring-1 ring-black/5",
                kindStyles(item.kind)
              )}
            >
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-md",
                  kindAccent(item.kind)
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900">{item.title}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{item.body}</p>
              </div>
              <button
                type="button"
                aria-label="Tutup notifikasi"
                className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  customerNotificationStore.dismiss(item.id);
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </Link>
          </div>
        );
      })}
    </div>
  );
}
