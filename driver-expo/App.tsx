import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as NavigationBar from "expo-navigation-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import type { WebViewMessageEvent, WebViewNavigation } from "react-native-webview";
import { DriverLoginScreen } from "./components/DriverLoginScreen";
import { clearLocalAuth, restoreNativeSession, syncNativeSession } from "./lib/auth-session";
import { fetchDriverMeNative, setDriverStatusNative } from "./lib/driver-api";
import { getDriverAppEntryUrls } from "./lib/driver-url";
import { pickReachableAppEntry } from "./lib/host-probe";
import { getAppEntryUrl, supabase } from "./lib/supabase";
import type { Session } from "@supabase/supabase-js";
import {
  initDriverOrderNotifications,
  postIncomingOrderNotification,
} from "./lib/driver-order-notification";

const ALLOWED_HOSTS = [
  "wirakuliner.web.id",
  "www.wirakuliner.web.id",
  "wirakuliner2.vercel.app",
  "localhost",
];

const WEB_LOAD_TIMEOUT_MS = 28_000;

const APP_ENTRY_URLS = getDriverAppEntryUrls();
const WEB_TIMEOUT_CODES = new Set([-8, 8, -6, 6]);
const nativeSessionInjectedRef = { current: false };

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

function injectSession(
  webRef: React.RefObject<WebView | null>,
  session: Session,
  force = false
) {
  if (!webRef.current) return false;
  if (nativeSessionInjectedRef.current && !force) return false;
  webRef.current.injectJavaScript(sessionBootstrapScript(session));
  nativeSessionInjectedRef.current = true;
  return true;
}

function nativeToolbarBootstrapScript() {
  return `
    (function() {
      window.__WIRA_APK_WEBVIEW__ = true;
      window.__WIRA_NATIVE_TOOLBAR__ = true;
      try {
        var root = document.documentElement;
        root.classList.add('wira-apk-webview', 'wira-native-toolbar-apk');
        root.style.backgroundColor = '#ffffff';
        if (document.body) document.body.style.backgroundColor = '#ffffff';
      } catch (e) {}
    })();
  `;
}

function webErrorGuardScript() {
  return `
    (function() {
      window.__WIRA_APK_WEBVIEW__ = true;
      window.__WIRA_NATIVE_TOOLBAR__ = true;
      try {
        document.documentElement.classList.add('wira-apk-webview', 'wira-native-toolbar-apk');
        document.documentElement.style.backgroundColor = '#ffffff';
        if (document.body) document.body.style.backgroundColor = '#ffffff';
      } catch (e) {}
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
      var prev = window.__WIRA_NATIVE_SESSION__;
      if (prev && prev.refresh_token === detail.refresh_token && window.__WIRA_SESSION_INJECTED__) {
        return;
      }
      window.__WIRA_NATIVE_SESSION__ = detail;
      window.__WIRA_SESSION_INJECTED__ = true;
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

function DriverWebShell({
  webRef,
  activeWebUrl,
  webUrlIndex,
  cacheBust,
  sessionKey,
  beforeLoadScript,
  webLoading,
  webError,
  driverState,
  onToggle,
  onLogout,
  onWebLoadStart,
  onWebLoadEnd,
  onNavChange,
  onMessage,
  onWebError,
  onHttpError,
  onContentProcessTerminate,
  reloadWebView,
  onRetry,
}: {
  webRef: React.RefObject<WebView | null>;
  activeWebUrl: string;
  webUrlIndex: number;
  cacheBust: number;
  sessionKey: string;
  beforeLoadScript: string;
  webLoading: boolean;
  webError: string | null;
  driverState: DriverState;
  onToggle: () => void;
  onLogout: () => void;
  onWebLoadStart: () => void;
  onWebLoadEnd: () => void;
  onNavChange: (nav: WebViewNavigation) => void;
  onMessage: (event: WebViewMessageEvent) => void;
  onWebError: (description: string, errorCode?: number, failedUrl?: string) => void;
  onHttpError: (statusCode: number, url?: string, description?: string) => void;
  onContentProcessTerminate: () => void;
  reloadWebView: (resetRetries?: boolean) => void;
  onRetry: () => void;
}) {
  const toggleDisabled = driverState.delivering && driverState.online;

  useEffect(() => {
    if (Platform.OS !== "android") return;
    void NavigationBar.setBackgroundColorAsync("#ffffff");
    void NavigationBar.setButtonStyleAsync("dark");
    void NavigationBar.setVisibilityAsync("visible");
  }, []);

  useEffect(() => {
    if (!webLoading) return;
    const timer = setTimeout(() => {
      onWebError("net::ERR_TIMED_OUT", 8, activeWebUrl);
    }, WEB_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [webLoading, activeWebUrl, onWebError]);

  const useNoCache = cacheBust > 0;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <StatusBar style="dark" backgroundColor="#ffffff" />
      <View style={styles.webColumn}>
        <View style={styles.webWrap}>
        <WebView
          key={`${sessionKey}-${webUrlIndex}-${cacheBust}`}
          ref={webRef}
          source={{ uri: activeWebUrl }}
          style={styles.web}
          startInLoadingState
          cacheEnabled={!useNoCache}
          cacheMode={
            Platform.OS === "android"
              ? useNoCache
                ? "LOAD_NO_CACHE"
                : "LOAD_DEFAULT"
              : undefined
          }
          injectedJavaScriptBeforeContentLoaded={beforeLoadScript}
          onLoadStart={onWebLoadStart}
          onLoadEnd={onWebLoadEnd}
          onNavigationStateChange={onNavChange}
          onShouldStartLoadWithRequest={(req) => isDriverWebPath(req.url)}
          onMessage={onMessage}
          onError={(e) => {
            const { description, code, url } = e.nativeEvent;
            onWebError(description, code, url);
          }}
          onHttpError={(e) => {
            const { statusCode, url, description } = e.nativeEvent;
            onHttpError(statusCode, url, description);
          }}
          onContentProcessDidTerminate={onContentProcessTerminate}
          renderError={(errorDomain, errorCode, errorDesc) => (
            <View style={styles.errorScreen}>
              <Text style={styles.errorTitle}>Gagal memuat halaman driver</Text>
              <Text style={styles.errorBody}>
                {errorDesc || "Koneksi timeout — periksa internet Anda."}
              </Text>
              {errorDomain && errorDomain !== "undefined" ? (
                <Text style={styles.errorMeta}>Host: {errorDomain}</Text>
              ) : (
                <Text style={styles.errorMeta}>
                  Host: {activeWebUrl.replace(/^https?:\/\//, "")}
                </Text>
              )}
              <Text style={styles.errorMeta}>Kode: {errorCode}</Text>
              <Pressable style={styles.errorRetryBtn} onPress={onRetry}>
                <Text style={styles.errorRetryText}>Coba lagi</Text>
              </Pressable>
            </View>
          )}
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
        {(webLoading || webError) && (
          <View style={styles.loader} pointerEvents={webError ? "auto" : "none"}>
            {webError ? (
              <>
                <Text style={styles.errorTitle}>Tidak bisa terhubung ke server</Text>
                <Text style={styles.errorBody}>{webError}</Text>
                <Text style={styles.errorMeta}>URL: {activeWebUrl.replace("https://", "")}</Text>
                <Pressable style={styles.errorRetryBtn} onPress={onRetry}>
                  <Text style={styles.errorRetryText}>Coba lagi</Text>
                </Pressable>
              </>
            ) : (
              <ActivityIndicator size="large" color="#34d399" />
            )}
          </View>
        )}
        </View>
      </View>
      <SafeAreaView
        style={[styles.toolbarWrap, { backgroundColor: "#ffffff" }]}
        edges={["bottom"]}
      >
        <View style={[styles.toolbar, { backgroundColor: "#ffffff" }]}>
          <Pressable
            style={[
              styles.toggleBtn,
              driverState.online ? styles.toggleOn : styles.toggleOff,
              toggleDisabled && styles.toggleDisabled,
            ]}
            onPress={onToggle}
            disabled={toggleDisabled}
          >
            <Text
              style={[
                styles.toggleText,
                driverState.online ? styles.toggleTextOn : styles.toggleTextOff,
              ]}
            >
              {driverState.online ? "● ONLINE" : "○ OFFLINE"}
            </Text>
            <Text
              style={[
                styles.toggleHint,
                driverState.online ? styles.toggleHintOn : styles.toggleHintOff,
              ]}
            >
              {driverState.delivering
                ? "Mengantar"
                : driverState.online
                  ? "Siap terima order"
                  : "Tidak menerima order"}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.logoutBtn, { backgroundColor: "#fef2f2", borderColor: "#fecaca" }]}
            onPress={onLogout}
          >
            <Text style={styles.logoutText}>Keluar</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </SafeAreaView>
  );
}

export default function App() {
  const webRef = useRef<WebView | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const sessionInjectedRef = useRef(false);
  const bootCompleteRef = useRef(false);
  const sessionRetryRef = useRef(0);
  const chunkReloadRef = useRef(0);
  const webRetryRef = useRef(0);
  const [phase, setPhase] = useState<AppPhase>("boot");
  const [session, setSession] = useState<Session | null>(null);
  const [webLoading, setWebLoading] = useState(true);
  const [webUrlIndex, setWebUrlIndex] = useState(0);
  const [cacheBust, setCacheBust] = useState(0);
  const [webError, setWebError] = useState<string | null>(null);
  const [sessionInjected, setSessionInjected] = useState(false);
  const [driverState, setDriverState] = useState<DriverState>({
    online: false,
    delivering: false,
    hasDriver: false,
  });

  const hideSpinner = useCallback(() => setWebLoading(false), []);

  const activeWebUrl = APP_ENTRY_URLS[webUrlIndex] ?? APP_ENTRY_URLS[0];

  const reloadWebView = useCallback(
    (resetRetries = false) => {
      if (resetRetries) {
        webRetryRef.current = 0;
        setWebUrlIndex(0);
      }
      setCacheBust((n) => n + 1);
      setWebError(null);
      setWebLoading(true);
      webRef.current?.reload();
    },
    []
  );

  const tryNextHost = useCallback(async () => {
    setWebError(null);
    setWebLoading(true);
    const nextIndex = (webUrlIndex + 1) % APP_ENTRY_URLS.length;
    if (nextIndex === 0 && webUrlIndex !== 0) {
      const picked = await pickReachableAppEntry(APP_ENTRY_URLS);
      if (picked) {
        webRetryRef.current = 0;
        setWebUrlIndex(picked.index);
        setCacheBust((n) => n + 1);
        return true;
      }
    }
    webRetryRef.current = 0;
    setWebUrlIndex(nextIndex);
    setCacheBust((n) => n + 1);
    return true;
  }, [webUrlIndex]);

  const handleWebLoadFailure = useCallback(
    (description: string, errorCode?: number, failedUrl?: string) => {
      const desc = description || "net::ERR_TIMED_OUT";
      const isTimeout =
        WEB_TIMEOUT_CODES.has(errorCode ?? -1) ||
        /timed out|timeout|ERR_TIMED_OUT|ERR_CONNECTION/i.test(desc);

      console.warn("[WebView] load failed", {
        code: errorCode,
        desc,
        url: failedUrl ?? activeWebUrl,
      });

      if (isTimeout && webUrlIndex < APP_ENTRY_URLS.length - 1) {
        const next = webUrlIndex + 1;
        webRetryRef.current = 0;
        setWebUrlIndex(next);
        setCacheBust((n) => n + 1);
        setWebError(null);
        setWebLoading(true);
        return;
      }

      if (webRetryRef.current < 3) {
        webRetryRef.current += 1;
        setCacheBust((n) => n + 1);
        setWebLoading(true);
        const delay = 1500 * webRetryRef.current;
        setTimeout(() => webRef.current?.reload(), delay);
        return;
      }

      setWebError(
        isTimeout
          ? "Koneksi ke server timeout. Periksa internet (WiFi/data) lalu coba lagi."
          : desc
      );
      hideSpinner();
    },
    [activeWebUrl, hideSpinner, webUrlIndex]
  );

  const redirectToAppEntry = useCallback(() => {
    bootCompleteRef.current = false;
    sessionInjectedRef.current = false;
    nativeSessionInjectedRef.current = false;
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
    sessionRetryRef.current = 0;
    sessionInjectedRef.current = false;
    nativeSessionInjectedRef.current = false;
    setSessionInjected(false);
    injectSession(webRef, next, true);
    webRef.current?.injectJavaScript(
      `window.location.replace(${JSON.stringify(getAppEntryUrl())}); true;`
    );
  }, []);

  const beforeLoadScript = useMemo(() => {
    const bootstrap = nativeToolbarBootstrapScript();
    if (!session) return bootstrap + webErrorGuardScript();
    return bootstrap + sessionBootstrapScript(session) + webErrorGuardScript();
  }, [session?.access_token, session?.refresh_token]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    void NavigationBar.setBackgroundColorAsync("#ffffff");
    void NavigationBar.setButtonStyleAsync("dark");
  }, []);

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
    if (phase !== "app") return;
    void initDriverOrderNotifications();
  }, [phase]);

  useEffect(() => {
    if (phase !== "app") return;
    let cancelled = false;
    void (async () => {
      const picked = await pickReachableAppEntry(APP_ENTRY_URLS);
      if (cancelled) return;
      if (picked) {
        setWebUrlIndex(picked.index);
      }
      setWebError(null);
      setWebLoading(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [phase]);

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

    const stopSpinner = setTimeout(hideSpinner, 4000);

    return () => {
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
        if (sessionRef.current) {
          injectSession(webRef, sessionRef.current, true);
        }
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
          sessionRetryRef.current = 0;
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
          const failMsg = (data as { message?: string }).message?.trim();
          if (sessionRetryRef.current < 2) {
            sessionRetryRef.current += 1;
            void reinjectFreshSession();
          } else {
            hideSpinner();
            setPhase("login");
            Alert.alert(
              "Sesi gagal",
              failMsg ||
                "Token login tidak valid. Silakan masuk ulang."
            );
          }
        }

        if (data.type === "WIRA_DRIVER_BOOT") {
          if (data.step === "session_ok" || data.step === "redirecting") {
            bootCompleteRef.current = true;
            hideSpinner();
          }
        }

        if (data.type === "WIRA_NAVIGATE") {
          const url = (data as { url?: string }).url;
          if (url) {
            hideSpinner();
            nativeSessionInjectedRef.current = false;
            webRef.current?.injectJavaScript(
              `window.location.replace(${JSON.stringify(url)}); true;`
            );
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
          void postIncomingOrderNotification({
            orderId: (data as { orderId?: string }).orderId ?? `order-${Date.now()}`,
            title: (data as { title?: string }).title ?? "Order masuk",
            body: (data as { body?: string }).body ?? "Buka aplikasi untuk melihat detail order",
            channel: (data as { channel?: string }).channel,
          });
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
    webRetryRef.current = 0;
    setWebError(null);
    webRef.current?.injectJavaScript(webErrorGuardScript());
    const active = sessionRef.current;
    if (active) {
      injectSession(webRef, active, true);
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
              nativeSessionInjectedRef.current = false;
              setSessionInjected(false);
              chunkReloadRef.current = 0;
              webRetryRef.current = 0;
              setWebUrlIndex(0);
              setWebError(null);
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
      <DriverWebShell
        webRef={webRef}
        activeWebUrl={activeWebUrl}
        webUrlIndex={webUrlIndex}
        cacheBust={cacheBust}
        sessionKey={session?.user?.id ?? "webview"}
        beforeLoadScript={beforeLoadScript}
        webLoading={webLoading}
        webError={webError}
        driverState={driverState}
        onToggle={() => void handleToggle()}
        onLogout={() => void handleLogout()}
        onWebLoadStart={() => {
          setWebError(null);
          setWebLoading(true);
        }}
        onWebLoadEnd={onWebLoadEnd}
        onNavChange={onNavChange}
        onMessage={onMessage}
        onWebError={handleWebLoadFailure}
        onHttpError={(statusCode, url, description) => {
          if (statusCode >= 500) {
            handleWebLoadFailure(description || `HTTP ${statusCode}`, statusCode, url);
          }
        }}
        onContentProcessTerminate={() => reloadWebView(false)}
        reloadWebView={reloadWebView}
        onRetry={() => void tryNextHost()}
      />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
    gap: 12,
    paddingHorizontal: 24,
  },
  root: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  webColumn: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  webWrap: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  toolbarWrap: {
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 8,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 6 : 12,
  },
  toggleBtn: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  toggleOn: {
    borderColor: "#6ee7b7",
    backgroundColor: "#ecfdf5",
  },
  toggleOff: {
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  toggleDisabled: {
    opacity: 0.72,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: "700",
  },
  toggleTextOn: {
    color: "#0f172a",
  },
  toggleTextOff: {
    color: "#0f172a",
  },
  toggleHint: {
    fontSize: 10,
    marginTop: 2,
    fontWeight: "500",
  },
  toggleHintOn: {
    color: "#047857",
  },
  toggleHintOff: {
    color: "#64748b",
  },
  logoutBtn: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  logoutText: {
    color: "#dc2626",
    fontSize: 12,
    fontWeight: "700",
  },
  web: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  loader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.94)",
  },
  errorScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 24,
  },
  errorTitle: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  errorBody: {
    color: "#475569",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 8,
  },
  errorMeta: {
    color: "#64748b",
    fontSize: 11,
    textAlign: "center",
    marginBottom: 4,
  },
  errorRetryBtn: {
    marginTop: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.45)",
    backgroundColor: "rgba(236,253,245,0.95)",
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  errorRetryText: {
    color: "#047857",
    fontSize: 14,
    fontWeight: "700",
  },
});
