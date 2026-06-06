import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import type { WebViewMessageEvent, WebViewNavigation } from "react-native-webview";
import { DriverLoginScreen } from "./components/DriverLoginScreen";
import { clearLocalAuth, restoreNativeSession, syncNativeSession } from "./lib/auth-session";
import { fetchDriverMeNative, setDriverStatusNative } from "./lib/driver-api";
import { getAppEntryUrl, supabase } from "./lib/supabase";
import type { Session } from "@supabase/supabase-js";
import { playNativeIncomingOrderSound } from "./lib/incoming-order-sound";

const ALLOWED_HOSTS = ["wirakuliner.web.id", "wirakuliner2.vercel.app", "localhost"];

function isAllowedUrl(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return ALLOWED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

function injectNativeCommand(
  webRef: React.RefObject<WebView | null>,
  action: "toggle" | "logout",
  online?: boolean
) {
  const detail = JSON.stringify({ action, online });
  webRef.current?.injectJavaScript(`
    (function() {
      window.dispatchEvent(new CustomEvent('wira-native-driver', { detail: ${detail} }));
    })();
    true;
  `);
}

function injectSession(webRef: React.RefObject<WebView | null>, session: Session) {
  if (!webRef.current) return false;
  webRef.current.injectJavaScript(sessionBootstrapScript(session));
  return true;
}

function webErrorGuardScript() {
  return `
    (function() {
      if (window.__WIRA_ERROR_GUARD__) return;
      window.__WIRA_ERROR_GUARD__ = true;
      function notifyChunk(msg) {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CHUNK_LOAD_ERROR', message: msg }));
        }
      }
      window.onerror = function(m, source) {
        var s = String(m || '');
        if (s.indexOf('ChunkLoadError') !== -1 || (source && String(source).indexOf('/_next/static/chunks/') !== -1)) {
          notifyChunk(s);
          return true;
        }
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'WEB_ERROR', message: s }));
        }
      };
      window.addEventListener('unhandledrejection', function(e) {
        var msg = String(e.reason && (e.reason.message || e.reason) || '');
        if (msg.indexOf('ChunkLoadError') !== -1 || msg.indexOf('Loading chunk') !== -1) {
          notifyChunk(msg);
        }
      });
    })();
    true;
  `;
}

function sessionBootstrapScript(session: Session) {
  const payload = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  return `
    (function() {
      var detail = ${payload};
      window.__WIRA_NATIVE_SESSION__ = detail;
      window.dispatchEvent(new CustomEvent('wira-set-session', { detail: detail }));
    })();
    true;
  `;
}

function isDriverHomeUrl(url: string) {
  try {
    const path = new URL(url).pathname.replace(/\/$/, "") || "/";
    return path === "/driver";
  } catch {
    return url.includes("/driver") && !url.includes("app-entry") && !url.includes("bridge");
  }
}

/** Hanya izinkan halaman driver di WebView APK — blokir /customer, /, dll. */
function isDriverWebPath(url: string) {
  try {
    const u = new URL(url);
    if (!isAllowedUrl(url)) return false;
    const p = u.pathname;
    if (p.startsWith("/driver")) return true;
    if (p === "/login") return true;
    if (p.startsWith("/_next/")) return true;
    if (p.startsWith("/api/driver")) return true;
    if (/\.[a-z0-9]+$/i.test(p)) return true;
    return false;
  } catch {
    return false;
  }
}

type AppPhase = "boot" | "login" | "app";
type DriverState = { online: boolean; delivering: boolean; hasDriver: boolean };

export default function App() {
  const webRef = useRef<WebView | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const sessionInjectedRef = useRef(false);
  const bootCompleteRef = useRef(false);
  const sessionRetryRef = useRef(0);
  const chunkReloadRef = useRef(0);
  const [phase, setPhase] = useState<AppPhase>("boot");
  const [session, setSession] = useState<Session | null>(null);
  const [webLoading, setWebLoading] = useState(true);
  const [sessionInjected, setSessionInjected] = useState(false);
  const [driverState, setDriverState] = useState<DriverState>({
    online: false,
    delivering: false,
    hasDriver: false,
  });

  const hideSpinner = useCallback(() => setWebLoading(false), []);

  const redirectToAppEntry = useCallback(() => {
    bootCompleteRef.current = false;
    sessionInjectedRef.current = false;
    setSessionInjected(false);
    if (sessionRef.current) {
      injectSession(webRef, sessionRef.current);
    }
    webRef.current?.injectJavaScript(
      `window.location.replace(${JSON.stringify(getAppEntryUrl())}); true;`
    );
  }, []);

  const reinjectFreshSession = useCallback(async () => {
    const next = await restoreNativeSession();
    if (!next) {
      setPhase("login");
      return;
    }
    sessionRef.current = next;
    setSession(next);
    bootCompleteRef.current = false;
    sessionInjectedRef.current = false;
    setSessionInjected(false);
    injectSession(webRef, next);
    webRef.current?.injectJavaScript(
      `window.location.replace(${JSON.stringify(getAppEntryUrl())}); true;`
    );
  }, []);

  const beforeLoadScript = useMemo(() => {
    if (!session) return webErrorGuardScript();
    return sessionBootstrapScript(session) + webErrorGuardScript();
  }, [session?.access_token, session?.refresh_token]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    sessionInjectedRef.current = sessionInjected;
  }, [sessionInjected]);

  useEffect(() => {
    void restoreNativeSession().then((next) => {
      if (next) {
        sessionRef.current = next;
        setSession(next);
        setPhase("app");
      } else {
        setPhase("login");
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      sessionRef.current = next;
      setSession(next);
      if (!next) {
        setPhase("login");
        sessionInjectedRef.current = false;
        setSessionInjected(false);
        setDriverState({ online: false, delivering: false, hasDriver: false });
      }
      if (event === "TOKEN_REFRESHED" && next) {
        sessionRef.current = next;
        setSession(next);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (phase !== "app" || !session) return;

    void fetchDriverMeNative(session.access_token).then(({ ok, json }) => {
      if (!ok || !json.driver) return;
      const d = json.driver;
      setDriverState({
        hasDriver: true,
        online: d.status === "idle" || d.status === "delivering",
        delivering: d.status === "delivering",
      });
      hideSpinner();
    });

    const injectRetry = setInterval(() => {
      if (bootCompleteRef.current || !sessionRef.current) return;
      if (sessionInjectedRef.current) return;
      if (injectSession(webRef, sessionRef.current)) {
        sessionInjectedRef.current = true;
        setSessionInjected(true);
      }
    }, 600);

    const stopSpinner = setTimeout(hideSpinner, 4000);

    return () => {
      clearInterval(injectRetry);
      clearTimeout(stopSpinner);
    };
  }, [phase, session, hideSpinner]);

  const onNavChange = useCallback(
    (nav: WebViewNavigation) => {
      if (!isAllowedUrl(nav.url)) {
        webRef.current?.stopLoading();
        webRef.current?.goBack();
        return;
      }
      if (
        nav.url.includes("error=unauthorized") ||
        nav.url.includes("need=customer") ||
        !isDriverWebPath(nav.url)
      ) {
        webRef.current?.stopLoading();
        redirectToAppEntry();
        return;
      }
      if (isDriverHomeUrl(nav.url)) {
        hideSpinner();
      }
      if (nav.url.includes("/login") && sessionRef.current) {
        webRef.current?.stopLoading();
        redirectToAppEntry();
      }
    },
    [hideSpinner, redirectToAppEntry]
  );

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data) as {
          type?: string;
          step?: string;
          online?: boolean;
          delivering?: boolean;
          hasDriver?: boolean;
          access_token?: string;
          refresh_token?: string;
        };

        if (
          data.type === "WIRA_SESSION_SYNC" &&
          data.access_token &&
          data.refresh_token
        ) {
          hideSpinner();
          bootCompleteRef.current = true;
          void syncNativeSession({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
          }).then((next) => {
            if (next) {
              sessionRef.current = next;
              setSession(next);
            }
          });
        }

        if (data.type === "WIRA_SESSION_FAILED") {
          if (sessionRetryRef.current < 2) {
            sessionRetryRef.current += 1;
            void reinjectFreshSession();
          } else {
            hideSpinner();
            setPhase("login");
            Alert.alert(
              "Sesi gagal",
              "Token login kedaluwarsa. Silakan masuk ulang."
            );
          }
        }

        if (data.type === "WIRA_DRIVER_BOOT") {
          if (data.step === "session_ok" || data.step === "redirecting") {
            bootCompleteRef.current = true;
            hideSpinner();
          }
        }

        if (data.type === "WIRA_DRIVER_STATE" || data.type === "WIRA_APP_READY") {
          setDriverState((s) => ({
            online: Boolean(data.online),
            delivering: Boolean(data.delivering),
            hasDriver: Boolean(data.hasDriver) || s.hasDriver,
          }));
          hideSpinner();
        }

        if (data.type === "WIRA_INCOMING_ORDER") {
          Vibration.vibrate([0, 180, 100, 180, 100, 280]);
          void playNativeIncomingOrderSound();
        }

        if (data.type === "CHUNK_LOAD_ERROR") {
          console.warn("[WebView] chunk error, reloading…", (data as { message?: string }).message);
          if (chunkReloadRef.current < 3) {
            chunkReloadRef.current += 1;
            setWebLoading(true);
            setTimeout(() => webRef.current?.reload(), 400);
          } else {
            hideSpinner();
          }
        }

        if (data.type === "WEB_ERROR") {
          const msg = (data as { message?: string }).message ?? "";
          if (/ChunkLoadError|Loading chunk \d+ failed/i.test(msg)) {
            if (chunkReloadRef.current < 3) {
              chunkReloadRef.current += 1;
              setWebLoading(true);
              setTimeout(() => webRef.current?.reload(), 400);
            } else {
              hideSpinner();
            }
          } else {
            console.warn("[WebView]", msg);
          }
        }
      } catch {
        /* ignore */
      }
    },
    [hideSpinner, reinjectFreshSession]
  );

  const onWebLoadEnd = useCallback(() => {
    webRef.current?.injectJavaScript(webErrorGuardScript());
    const active = sessionRef.current;
    if (active) {
      injectSession(webRef, active);
      sessionInjectedRef.current = true;
      setSessionInjected(true);
    }
    setTimeout(hideSpinner, 600);
  }, [hideSpinner]);

  async function handleToggle() {
    if (phase !== "app") {
      Alert.alert("Belum login", "Masuk dengan email & password driver di layar login aplikasi.");
      return;
    }
    const active = (await restoreNativeSession()) ?? session;
    if (!active) {
      setPhase("login");
      Alert.alert("Sesi habis", "Silakan login ulang.");
      return;
    }
    if (driverState.delivering && driverState.online) {
      Alert.alert("Sedang mengantar", "Selesaikan pengantaran aktif sebelum mematikan status.");
      return;
    }
    const nextOnline = !driverState.online;
    const status = nextOnline ? "idle" : "offline";
    const { ok, json } = await setDriverStatusNative(active.access_token, status);
    if (!ok) {
      Alert.alert("Gagal", (json as { error?: string }).error ?? "Tidak bisa ubah status");
      return;
    }
    setDriverState((s) => ({ ...s, online: nextOnline }));
    injectNativeCommand(webRef, "toggle", nextOnline);
  }

  async function handleLogout() {
    Alert.alert("Keluar", "Keluar dari akun driver?", [
      { text: "Batal", style: "cancel" },
      {
        text: "Keluar",
        style: "destructive",
        onPress: async () => {
          injectNativeCommand(webRef, "logout");
          await supabase.auth.signOut();
          await clearLocalAuth();
          sessionInjectedRef.current = false;
          setSessionInjected(false);
          setPhase("login");
        },
      },
    ]);
  }

  if (phase === "boot") {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color="#34d399" />
      </View>
    );
  }

  if (phase === "login") {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
          <StatusBar style="light" />
          <DriverLoginScreen
            onLoggedIn={async () => {
              const { data } = await supabase.auth.getSession();
              sessionRef.current = data.session;
              setSession(data.session);
              bootCompleteRef.current = false;
              sessionRetryRef.current = 0;
              sessionInjectedRef.current = false;
              setSessionInjected(false);
              chunkReloadRef.current = 0;
              setWebLoading(true);
              setPhase("app");
            }}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
        <StatusBar style="light" />
        <WebView
          key={session?.user?.id ?? "webview"}
          ref={webRef}
          source={{ uri: getAppEntryUrl() }}
          style={styles.web}
          cacheEnabled={false}
          cacheMode={Platform.OS === "android" ? "LOAD_NO_CACHE" : undefined}
          injectedJavaScriptBeforeContentLoaded={beforeLoadScript}
          onLoadEnd={onWebLoadEnd}
          onNavigationStateChange={onNavChange}
          onShouldStartLoadWithRequest={(req) => isDriverWebPath(req.url)}
          onMessage={onMessage}
          onError={(e) => console.warn("[WebView] error", e.nativeEvent.description)}
          onHttpError={(e) => console.warn("[WebView] HTTP", e.nativeEvent.statusCode, e.nativeEvent.url)}
          geolocationEnabled
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          allowsBackForwardNavigationGestures
          setSupportMultipleWindows={false}
          originWhitelist={["https://*", "http://*"]}
          userAgent={
            Platform.OS === "android"
              ? "WIRADriverExpo/1.0 Android"
              : "WIRADriverExpo/1.0 iOS"
          }
        />
        {webLoading && (
          <View style={styles.loader} pointerEvents="none">
            <ActivityIndicator size="large" color="#34d399" />
          </View>
        )}
        <View style={styles.toolbar}>
          <Pressable
            style={[
              styles.toggleBtn,
              driverState.online ? styles.toggleOn : styles.toggleOff,
              driverState.delivering && driverState.online && styles.toggleDisabled,
            ]}
            onPress={handleToggle}
            disabled={driverState.delivering && driverState.online}
          >
            <Text style={styles.toggleText}>
              {driverState.online ? "● ONLINE" : "○ OFFLINE"}
            </Text>
            <Text style={styles.toggleHint}>
              {driverState.delivering
                ? "Mengantar"
                : driverState.online
                  ? "Siap terima order"
                  : "Tidak menerima order"}
            </Text>
          </Pressable>
          <Pressable style={styles.logoutBtn} onPress={handleLogout}>
            <Text style={styles.logoutText}>Keluar</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f172a",
  },
  root: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  web: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.85)",
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    backgroundColor: "#0f172a",
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingBottom: Platform.OS === "ios" ? 4 : 10,
  },
  toggleBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  toggleOn: {
    borderColor: "rgba(52,211,153,0.5)",
    backgroundColor: "rgba(16,185,129,0.15)",
  },
  toggleOff: {
    borderColor: "rgba(100,116,139,0.5)",
    backgroundColor: "rgba(51,65,85,0.4)",
  },
  toggleDisabled: {
    opacity: 0.65,
  },
  toggleText: {
    color: "#ecfdf5",
    fontSize: 13,
    fontWeight: "700",
  },
  toggleHint: {
    color: "#94a3b8",
    fontSize: 10,
    marginTop: 2,
  },
  logoutBtn: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.4)",
    backgroundColor: "rgba(127,29,29,0.25)",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  logoutText: {
    color: "#fca5a5",
    fontSize: 12,
    fontWeight: "600",
  },
});
