"use client";

import { createContext, useContext, useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ensureDriverNativeSession,
  getNativeAccessToken,
  isDriverApkWebView,
  waitForNativeAccessToken,
} from "@/lib/driver-native-session";
import { postNativeSessionFailed } from "@/lib/driver-session-sync";
import type { Driver } from "@/types/database";

type DriverProfileValue = {
  driver: Driver | null;
  userId: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const DriverProfileContext = createContext<DriverProfileValue | null>(null);

async function fetchDriverMeBearer(
  accessToken: string,
  timeoutMs = 10_000
): Promise<{ driver: Driver | null; status: number }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("/api/driver/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) return { driver: null, status: res.status };
    const j = (await res.json()) as { driver?: Driver };
    return { driver: j.driver ?? null, status: res.status };
  } catch {
    return { driver: null, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

async function queryDriverRow(
  supabase: ReturnType<typeof createClient>,
  uid: string,
  timeoutMs = 8_000
): Promise<Driver | null> {
  try {
    const { data, error } = await Promise.race([
      supabase
        .from("drivers")
        .select(
          "id,profile_id,name,phone,vehicle_plate,photo_url,status,current_lat,current_lng,service_category,fcm_token,reward_points,created_at"
        )
        .eq("profile_id", uid)
        .maybeSingle(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), timeoutMs)
      ),
    ]);
    if (error) console.warn("[driver profile]", error.message);
    return (data as Driver) ?? null;
  } catch (e) {
    if (e instanceof Error && e.message === "timeout") {
      console.warn("[driver profile] query timeout");
    }
    return null;
  }
}

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
  const refreshGenRef = useRef(0);
  const refreshingRef = useRef(false);
  const loadedTokenRef = useRef<string | null>(null);
  const nativeReadySentRef = useRef(false);
  const sessionFailAtRef = useRef(0);
  const driverRef = useRef<Driver | null>(null);

  useEffect(() => {
    driverRef.current = driver;
  }, [driver]);

  const refresh = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      const gen = ++refreshGenRef.current;
      const silent = Boolean(opts?.silent);
      const currentDriver = driverRef.current;

      try {
        if (isDriverApkWebView()) {
          const token =
            getNativeAccessToken() ?? (await waitForNativeAccessToken(silent ? 1_500 : 4_000));
          if (gen !== refreshGenRef.current) return;

          if (!token) {
            if (!silent && !currentDriver) {
              const now = Date.now();
              if (now - sessionFailAtRef.current > 30_000) {
                sessionFailAtRef.current = now;
                postNativeSessionFailed("Token driver belum tersedia");
              }
            }
            return;
          }

          if (loadedTokenRef.current === token && currentDriver) {
            return;
          }

          const { driver: apkDriver, status } = await fetchDriverMeBearer(token);
          if (gen !== refreshGenRef.current) return;

          if (apkDriver) {
            loadedTokenRef.current = token;
            setDriver(apkDriver);
            setUserId(apkDriver.profile_id);
            if (!nativeReadySentRef.current) {
              nativeReadySentRef.current = true;
              postNativeReady(apkDriver);
            }
            return;
          }

          if (!silent && !currentDriver && (status === 401 || status === 403)) {
            const now = Date.now();
            if (now - sessionFailAtRef.current > 30_000) {
              sessionFailAtRef.current = now;
              postNativeSessionFailed("Sesi driver kedaluwarsa — login ulang");
            }
          }
          return;
        }

        await ensureDriverNativeSession(supabase);
        if (gen !== refreshGenRef.current) return;

        const sessionRes = await Promise.race([
          supabase.auth.getSession(),
          new Promise<{ data: { session: null } }>((resolve) =>
            setTimeout(() => resolve({ data: { session: null } }), 5_000)
          ),
        ]);
        const uid = sessionRes.data.session?.user?.id ?? null;

        if (!uid) {
          setDriver(null);
          setUserId(null);
          return;
        }

        setUserId(uid);
        const row = await queryDriverRow(supabase, uid);
        if (gen !== refreshGenRef.current) return;
        setDriver(row);
        if (row && !nativeReadySentRef.current) {
          nativeReadySentRef.current = true;
          postNativeReady(row);
        }
      } catch (e) {
        console.warn("[driver profile]", e);
        if (!silent) setDriver(null);
      } finally {
        refreshingRef.current = false;
        if (gen === refreshGenRef.current) {
          setLoading(false);
        }
      }
    },
    [supabase]
  );

  useEffect(() => {
    void refresh();

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    function onNativeSession(e: Event) {
      const detail = (e as CustomEvent<{ refresh_token?: string }>).detail;
      const rt = detail?.refresh_token ?? null;
      if (rt && loadedTokenRef.current && driverRef.current) return;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void refresh({ silent: Boolean(driverRef.current) });
      }, 400);
    }
    window.addEventListener("wira-set-session", onNativeSession);

    let sub: { unsubscribe: () => void } | undefined;
    if (!isDriverApkWebView()) {
      const { data } = supabase.auth.onAuthStateChange(() => {
        void refresh({ silent: true });
      });
      sub = data.subscription;
    }

    const safety = setTimeout(() => setLoading(false), 12_000);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener("wira-set-session", onNativeSession);
      sub?.unsubscribe();
      clearTimeout(safety);
    };
  }, [refresh, supabase]);

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

  return {
    driver,
    userId,
    loading,
    refresh: () => refresh({ silent: false }),
  };
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
