/** Domain kanonik dulu — cookie & sesi konsisten di semua driver. */
const DEFAULT_HOSTS = [
  "https://wirakuliner.web.id",
  "https://www.wirakuliner.web.id",
  "https://wirakuliner2.vercel.app",
];

/** URL health-check ringan per host. */
export function getDriverPingUrls(): string[] {
  return getDriverAppEntryUrls().map((entry) =>
    entry.replace("/driver/app-entry", "/api/driver/ping")
  );
}

function hostFromDriverEnv(): string | null {
  const raw = process.env.EXPO_PUBLIC_DRIVER_URL?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/** Base URL production — prioritas env, lalu fallback canonical. */
export function getDriverBaseUrl(): string {
  return hostFromDriverEnv() ?? DEFAULT_HOSTS[0];
}

/** Daftar URL app-entry untuk retry bila satu host timeout. */
export function getDriverAppEntryUrls(): string[] {
  const urls: string[] = [];
  const envHost = hostFromDriverEnv();
  if (envHost) {
    urls.push(`${envHost}/driver/app-entry`);
  }
  for (const host of DEFAULT_HOSTS) {
    const entry = `${host}/driver/app-entry`;
    if (!urls.includes(entry)) urls.push(entry);
  }
  return urls;
}

export function getAppEntryUrl(): string {
  return getDriverAppEntryUrls()[0];
}

/** URL dashboard driver — muat langsung, hindari putaran app-entry di WebView. */
export function getDriverHomeUrls(): string[] {
  return getDriverAppEntryUrls().map((entry) =>
    entry.replace("/driver/app-entry", "/driver")
  );
}

export function getDriverHomeUrl(): string {
  return getDriverHomeUrls()[0];
}
