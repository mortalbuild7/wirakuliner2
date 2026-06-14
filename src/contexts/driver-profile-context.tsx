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

function readPreloadedApkDriver(): Driver | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { __WIRA_NATIVE_DRIVER__?: Driver };
  const d = w.__WIRA_NATIVE_DRIVER__;
  if (!d?.id) return null;
  return d;
}

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
  const preloaded = isDriverApkWebView() ? readPreloadedApkDriver() : null;
  const [driver, setDriver] = useState<Driver | null>(preloaded);
  const [userId, setUserId] = useState<string | null>(preloaded?.profile_id ?? null);
  const [loading, setLoading] = useState(!preloaded);
  const supabase = createClient();
  const refreshGenRef = useRef(0);
  const refreshingRef = useRef(false);
  const loadedTokenRef = useRef<string | null>(null);
  const nativeReadySentRef = useRef(Boolean(preloaded));
  const sessionFailAtRef = useRef(0);
  const driverRef = useRef<Driver | null>(preloaded);

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
          const pre = readPreloadedApkDriver();
          if (pre?.id && !currentDriver) {
            setDriver(pre);
            setUserId(pre.profile_id);
            if (!nativeReadySentRef.current) {
              nativeReadySentRef.current = true;
              postNativeReady(pre);
            }
            return;
          }

          if (pre?.id && currentDriver?.id === pre.id && silent) {
            return;
          }

          const token =
            getNativeAccessToken() ?? (await waitForNativeAccessToken(silent ? 800 : 3_000));
          if (gen !== refreshGenRef.current) return;

          if (!token) {
            if (pre?.id) {
              setDriver(pre);
              setUserId(pre.profile_id);
              return;
            }
            if (!silent && !currentDriver) {
              const now = Date.now();
              if (now - sessionFailAtRef.current > 60_000) {
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

          if (pre?.id) {
            setDriver(pre);
            setUserId(pre.profile_id);
            return;
          }

          if (!silent && !currentDriver && (status === 401 || status === 403)) {
            const now = Date.now();
            if (now - sessionFailAtRef.current > 60_000) {
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
        const pre = readPreloadedApkDriver();
        if (pre?.id) {
          setDriver(pre);
          setUserId(pre.profile_id);
        } else if (!silent) {
          setDriver(null);
        }
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
    if (preloaded) {
      postNativeReady(preloaded);
      return;
    }
    void refresh();

    const safety = setTimeout(() => setLoading(false), 8_000);
    return () => clearTimeout(safety);
  }, [preloaded, refresh]);

  useEffect(() => {
    if (!driver?.id || isDriverApkWebView()) return;
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
