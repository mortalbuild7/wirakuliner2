export type RoutePoint = { lat: number; lng: number };

const OSRM_ENDPOINTS = [
  (from: RoutePoint, to: RoutePoint) =>
    `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`,
  (from: RoutePoint, to: RoutePoint) =>
    `https://routing.openstreetmap.de/routed-car/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`,
];

function straightLineFallback(
  from: RoutePoint,
  to: RoutePoint
): [number, number][] {
  return [
    [from.lat, from.lng],
    [to.lat, to.lng],
  ];
}

/** Panggil OSRM dari server (tanpa masalah CORS WebView). */
export async function fetchOsrmDrivingRoute(
  from: RoutePoint,
  to: RoutePoint
): Promise<[number, number][]> {
  for (const buildUrl of OSRM_ENDPOINTS) {
    try {
      const url = buildUrl(from, to);
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: "application/json" },
      });
      if (!res.ok) continue;

      const data = (await res.json()) as {
        code?: string;
        routes?: { geometry?: { coordinates?: [number, number][] } }[];
      };

      if (data.code && data.code !== "Ok") continue;

      const coords = data.routes?.[0]?.geometry?.coordinates;
      if (!coords || coords.length < 2) continue;

      return coords.map(([lng, lat]) => [lat, lng] as [number, number]);
    } catch {
      continue;
    }
  }

  return straightLineFallback(from, to);
}

/** Client: ambil rute jalan lewat API app (proxy OSRM). */
export async function fetchRoadRoute(
  from: RoutePoint,
  to: RoutePoint
): Promise<[number, number][]> {
  const fallback = straightLineFallback(from, to);

  try {
    const params = new URLSearchParams({
      fromLat: String(from.lat),
      fromLng: String(from.lng),
      toLat: String(to.lat),
      toLng: String(to.lng),
    });

    let res: Response;
    if (typeof window !== "undefined") {
      const { fetchWithDriverAuth } = await import("@/lib/driver-native-session");
      res = await fetchWithDriverAuth(`/api/driver/route?${params}`);
    } else {
      res = await fetch(`/api/driver/route?${params}`, {
        signal: AbortSignal.timeout(12_000),
      });
    }

    if (!res.ok) return fallback;

    const data = (await res.json()) as {
      coordinates?: [number, number][];
      fallback?: boolean;
    };

    const coords = data.coordinates;
    if (!coords || coords.length < 2) return fallback;

    return coords;
  } catch {
    return fallback;
  }
}
