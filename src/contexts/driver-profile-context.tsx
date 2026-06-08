"use client";

import { createContext, useContext, useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ensureDriverNativeSession } from "@/lib/driver-native-session";
import type { Driver } from "@/types/database";

type DriverProfileValue = {
  driver: Driver | null;
  userId: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const DriverProfileContext = createContext<DriverProfileValue | null>(null);

function postNativeReady(driver: Driver | null) {
  const rn = (window as Window & { ReactNativeWebView?: { postMessage: (s: string) => void } })
    .ReactNativeWebView;
  if (!rn) return;
  const online = driver?.status === "idle" || driver?.status === "delivering";
  rn.postMessage(
    JSON.stringify({
      type: "WIRA_APP_READY",
      hasDriver: Boolean(driver),
      online,
      delivering: driver?.status === "delivering",
    })
  );
}

function useDriverProfileImpl(): DriverProfileValue {
  const [driver, setDriver] = useState<Driver | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const refresh = useCallback(async () => {
    try {
      await ensureDriverNativeSession(supabase);

      const sessionRes = await Promise.race([
        supabase.auth.getSession(),
        new Promise<{ data: { session: null } }>((resolve) =>
          setTimeout(() => resolve({ data: { session: null } }), 6000)
        ),
      ]);
      let uid = sessionRes.data.session?.user?.id ?? null;

      if (!uid) {
        const tokens = (
          window as Window & {
            __WIRA_NATIVE_SESSION__?: { access_token: string; refresh_token: string };
          }
        ).__WIRA_NATIVE_SESSION__;
        if (tokens?.access_token) {
          const me = await fetch("/api/driver/me", {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          });
          if (me.ok) {
            const j = (await me.json()) as { driver?: Driver };
            if (j.driver) {
              setDriver(j.driver);
              setUserId(j.driver.profile_id);
              return;
            }
          }
        }
        setDriver(null);
        setUserId(null);
        return;
      }

      setUserId(uid);
      const { data, error } = await supabase
        .from("drivers")
        .select(
          "id,profile_id,name,phone,vehicle_plate,photo_url,status,current_lat,current_lng,fcm_token,reward_points,created_at"
        )
        .eq("profile_id", uid)
        .maybeSingle();
      if (error) console.warn("[driver profile]", error.message);
      setDriver((data as Driver) ?? null);
    } catch (e) {
      console.warn("[driver profile]", e);
      setDriver(null);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void refresh();

    function onNativeSession() {
      void refresh();
    }
    window.addEventListener("wira-set-session", onNativeSession);

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });
    return () => {
      window.removeEventListener("wira-set-session", onNativeSession);
      sub.subscription.unsubscribe();
    };
  }, [refresh, supabase]);

  useEffect(() => {
    if (loading) return;
    const d = driver;
    postNativeReady(d);
    if (d) {
      const rn = (window as Window & { ReactNativeWebView?: { postMessage: (s: string) => void } })
        .ReactNativeWebView;
      rn?.postMessage(
        JSON.stringify({
          type: "WIRA_DRIVER_STATE",
          online: d.status === "idle" || d.status === "delivering",
          delivering: d.status === "delivering",
          hasDriver: true,
        })
      );
    }
  }, [loading, driver]);

  useEffect(() => {
    if (!driver?.id) return;
    const ch = supabase
      .channel(`driver-profile-${driver.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "drivers", filter: `id=eq.${driver.id}` },
        (p) => setDriver(p.new as Driver)
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [driver?.id, supabase]);

  return { driver, userId, loading, refresh };
}

export function DriverProfileProvider({ children }: { children: React.ReactNode }) {
  const value = useDriverProfileImpl();
  return (
    <DriverProfileContext.Provider value={value}>{children}</DriverProfileContext.Provider>
  );
}

export function useDriverProfile(): DriverProfileValue {
  const ctx = useContext(DriverProfileContext);
  if (!ctx) {
    throw new Error("useDriverProfile harus di dalam DriverProfileProvider");
  }
  return ctx;
}
