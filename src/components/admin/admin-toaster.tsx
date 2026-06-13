"use client";

import { Toaster } from "sonner";

export function AdminToaster() {
  return (
    <Toaster
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        className: "text-slate-900",
        classNames: {
          error: "border-red-300 bg-red-50 text-red-950",
          success: "border-emerald-300 bg-emerald-50 text-emerald-950",
        },
      }}
    />
  );
}
