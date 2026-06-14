const PROBE_UA = "WIRADriverExpo/1.0 Android";

/** Cek host bisa dijangkau sebelum WebView dimuat (hindari ERR_TIMED_OUT tanpa retry). */
export async function probeDriverHost(
  entryUrl: string,
  timeoutMs = 14_000
): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(entryUrl, {
      method: "GET",
      signal: ctrl.signal,
      headers: {
        "User-Agent": PROBE_UA,
        Accept: "text/html",
      },
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Pilih URL app-entry pertama yang merespons. */
export async function pickReachableAppEntry(
  urls: string[]
): Promise<{ url: string; index: number } | null> {
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    if (await probeDriverHost(url)) {
      return { url, index: i };
    }
  }
  return null;
}
