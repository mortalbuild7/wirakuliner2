const PROBE_UA = "WIRADriverExpo/1.0 Android";
const PROBE_TIMEOUT_MS = 6_000;

async function probeUrl(url: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: ctrl.signal,
      headers: {
        "User-Agent": PROBE_UA,
        Accept: "application/json, text/html",
      },
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Cek host bisa dijangkau — prefer endpoint ping ringan. */
export async function probeDriverHost(
  entryUrl: string,
  timeoutMs = PROBE_TIMEOUT_MS
): Promise<boolean> {
  const pingUrl = entryUrl.replace("/driver/app-entry", "/api/driver/ping");
  if (await probeUrl(pingUrl, timeoutMs)) return true;
  return probeUrl(entryUrl, Math.min(timeoutMs, 4_000));
}

/** Pilih host pertama yang merespons (uji paralel agar tidak menunggu beruntun). */
export async function pickReachableAppEntry(
  urls: string[]
): Promise<{ url: string; index: number } | null> {
  if (urls.length === 0) return null;

  const checks = await Promise.all(
    urls.map(async (url, index) => ({
      index,
      url,
      ok: await probeDriverHost(url),
    }))
  );

  const hit = checks.find((c) => c.ok);
  if (hit) return { url: hit.url, index: hit.index };

  return { url: urls[0], index: 0 };
}
