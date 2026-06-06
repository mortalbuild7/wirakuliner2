/** Ambil polyline rute jalan (OSRM) dari A ke B. Fallback garis lurus jika gagal. */
export async function fetchRoadRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): Promise<[number, number][]> {
  const fallback: [number, number][] = [
    [from.lat, from.lng],
    [to.lat, to.lng],
  ];

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return fallback;

    const data = (await res.json()) as {
      code?: string;
      routes?: { geometry?: { coordinates?: [number, number][] } }[];
    };

    const coords = data.routes?.[0]?.geometry?.coordinates;
    if (!coords?.length) return fallback;

    return coords.map(([lng, lat]) => [lat, lng] as [number, number]);
  } catch {
    return fallback;
  }
}
