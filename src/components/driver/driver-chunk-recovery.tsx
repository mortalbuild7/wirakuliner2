"use client";

import { useEffect } from "react";

/** Muat ulang sekali jika chunk JS gagal (cache WebView / deploy baru). */
export function DriverChunkRecovery() {
  useEffect(() => {
    const key = "wira_chunk_reload";
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(key)) return;

    function isChunkError(msg: string) {
      return /ChunkLoadError|Loading chunk \d+ failed/i.test(msg);
    }

    function reloadOnce() {
      try {
        sessionStorage.setItem(key, "1");
      } catch {
        /* ignore */
      }
      const base = window.location.pathname + window.location.search;
      window.location.replace(`${base}${base.includes("?") ? "&" : "?"}_cb=${Date.now()}`);
    }

    function onError(message: string | Event, source?: string) {
      const msg = String(message ?? "");
      if (isChunkError(msg) || (source && source.includes("/_next/static/chunks/"))) {
        reloadOnce();
      }
    }

    function onRejection(e: PromiseRejectionEvent) {
      const msg = String((e.reason as Error)?.message ?? e.reason ?? "");
      if (isChunkError(msg)) reloadOnce();
    }

    window.addEventListener("error", (e) => onError(e.message, e.filename));
    window.addEventListener("unhandledrejection", onRejection);

    return () => {
      window.removeEventListener("error", (e) => onError(e.message, e.filename));
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
