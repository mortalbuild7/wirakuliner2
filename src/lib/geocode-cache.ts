const TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 400;

type CacheEntry = { body: unknown; expires: number };

const globalStore = globalThis as typeof globalThis & {
  __wiraGeocodeCache?: Map<string, CacheEntry>;
};

function store(): Map<string, CacheEntry> {
  if (!globalStore.__wiraGeocodeCache) {
    globalStore.__wiraGeocodeCache = new Map();
  }
  return globalStore.__wiraGeocodeCache;
}

function prune(map: Map<string, CacheEntry>) {
  const now = Date.now();
  for (const [key, entry] of map) {
    if (entry.expires <= now) map.delete(key);
  }
  while (map.size > MAX_ENTRIES) {
    const oldest = map.keys().next().value;
    if (!oldest) break;
    map.delete(oldest);
  }
}

export function geocodeCacheKey(
  reverse: boolean,
  q: string | null,
  lat: number | null,
  lng: number | null,
  nearLat: number | null,
  nearLng: number | null
): string {
  if (reverse && lat != null && lng != null) {
    return `r:${lat.toFixed(5)},${lng.toFixed(5)}`;
  }
  const near =
    nearLat != null && nearLng != null
      ? `@${nearLat.toFixed(3)},${nearLng.toFixed(3)}`
      : "";
  return `s:${(q ?? "").toLowerCase().trim()}${near}`;
}

export function getGeocodeCache(key: string): unknown | null {
  const map = store();
  const entry = map.get(key);
  if (!entry) return null;
  if (entry.expires <= Date.now()) {
    map.delete(key);
    return null;
  }
  return entry.body;
}

export function setGeocodeCache(key: string, body: unknown) {
  const map = store();
  prune(map);
  map.set(key, { body, expires: Date.now() + TTL_MS });
}
