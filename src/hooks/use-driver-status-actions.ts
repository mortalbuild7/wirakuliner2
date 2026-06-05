"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchWithDriverAuth } from "@/lib/driver-native-session";
import type { Driver, DriverStatus } from "@/types/database";

export function useDriverStatusActions(
  driver: Driver | null,
  refresh: () => Promise<void>
) {
  const [loading, setLoading] = useState(false);

  const isOnline =
    driver?.status === "idle" || driver?.status === "delivering";
  const isDelivering = driver?.status === "delivering";

  const setStatus = useCallback(
    async (next: DriverStatus) => {
      if (!driver) return false;
      setLoading(true);
      try {
        const res = await fetchWithDriverAuth("/api/driver/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: next }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          alert((j as { error?: string }).error ?? "Gagal ubah status");
          return false;
        }
        await refresh();
        return true;
      } finally {
        setLoading(false);
      }
    },
    [driver, refresh]
  );

  const setOnline = useCallback(
    async (on: boolean) => {
      if (!driver) return false;
      if (isDelivering && !on) {
        alert("Selesaikan pengantaran aktif sebelum mematikan status.");
        return false;
      }
      return setStatus(on ? "idle" : "offline");
    },
    [driver, isDelivering, setStatus]
  );

  const logout = useCallback(async (options?: { skipConfirm?: boolean }) => {
    if (!options?.skipConfirm && !confirm("Keluar dari akun driver?")) return;
    setLoading(true);
    try {
      if (driver && isOnline && !isDelivering) {
        await setStatus("offline");
      }
      const supabase = createClient();
      await supabase.auth.signOut();
      window.location.assign("/login?redirect=/driver");
    } finally {
      setLoading(false);
    }
  }, [driver, isOnline, isDelivering, setStatus]);

  return {
    loading,
    isOnline,
    isDelivering,
    setStatus,
    setOnline,
    logout,
  };
}
