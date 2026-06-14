/** Vercel.app dulu — DNS lebih stabil di beberapa jaringan operator HP. */
const DEFAULT_HOSTS = [
  "https://wirakuliner2.vercel.app",
  "https://wirakuliner.web.id",
  "https://www.wirakuliner.web.id",
];

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
