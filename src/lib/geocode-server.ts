import "server-only";
import { formatGeocodeLabel, type GeocodeHit } from "@/lib/geocode";

/** Endpoint Nominatim OSM — gratis, tidak butuh API key Google. */
const NOMINATIM = "https://nominatim.openstreetmap.org";
/** User-Agent wajib per kebijakan Nominatim — identifikasi aplikasi. */
const USER_AGENT = "WIRAKuliner/1.0 (https://wirakuliner.web.id; contact@mortalbuild7)";

/** Google Geocoding opsional — dipakai hanya jika env key diisi. */
function googleKey(): string | null {
  const k = process.env.GOOGLE_GEOCODING_API_KEY?.trim();
  return k || null;
}

function parseGoogleReverseHit(
  data: unknown,
  fallbackLat: number,
  fallbackLng: number
): GeocodeHit | null {
  const payload = data as {
    status?: string;
    results?: Array<{
      formatted_address?: string;
      geometry?: { location?: { lat?: number; lng?: number } };
    }>;
  };

  const address = payload?.results?.[0]?.formatted_address?.trim();
  if (!address) return null;

  const loc = payload?.results?.[0]?.geometry?.location;
  return {
    lat: Number.isFinite(loc?.lat) ? (loc!.lat as number) : fallbackLat,
    lng: Number.isFinite(loc?.lng) ? (loc!.lng as number) : fallbackLng,
    label: formatGeocodeLabel(address),
  };
}

/**
 * Reverse geocode koordinat → label alamat.
 * Tidak throw — gagal/rate-limit mengembalikan null (caller pakai fallback koordinat).
 */
export async function reverseGeocodeCoords(
  lat: number,
  lng: number
): Promise<GeocodeHit | null> {
  const gKey = googleKey();
  if (gKey) {
    try {
      const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
      url.searchParams.set("latlng", `${lat},${lng}`);
      url.searchParams.set("key", gKey);
      url.searchParams.set("language", "id");
      url.searchParams.set("result_type", "street_address|route|premise|subpremise");

      const res = await fetch(url.toString(), { cache: "no-store" });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        const hit = parseGoogleReverseHit(data, lat, lng);
        if (hit) return hit;
      }
    } catch {
      /* Google gagal — lanjut Nominatim */
    }
  }

  try {
    const url = new URL(`${NOMINATIM}/reverse`);
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("format", "json");
    url.searchParams.set("zoom", "18");
    url.searchParams.set("addressdetails", "1");

    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      cache: "no-store",
    });
    if (!res.ok) return null;

    const data = (await res.json().catch(() => null)) as {
      display_name?: string;
      lat?: string;
      lon?: string;
    } | null;

    const displayName = data?.display_name?.trim();
    if (!displayName) return null;

    return {
      lat: Number.isFinite(Number(data?.lat)) ? Number(data!.lat) : lat,
      lng: Number.isFinite(Number(data?.lon)) ? Number(data!.lon) : lng,
      label: formatGeocodeLabel(displayName),
    };
  } catch {
    return null;
  }
}

/**
 * Forward geocode / autocomplete — Google (opsional) atau Nominatim.
 */
export async function searchGeocodeQuery(
  query: string,
  nearLat?: number,
  nearLng?: number
): Promise<GeocodeHit[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const gKey = googleKey();
  if (gKey) {
    try {
      const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
      url.searchParams.set("address", q);
      url.searchParams.set("key", gKey);
      url.searchParams.set("language", "id");
      url.searchParams.set("components", "country:ID");
      if (nearLat != null && nearLng != null) {
        url.searchParams.set("bounds", buildBounds(nearLat, nearLng));
      }

      const res = await fetch(url.toString(), { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as {
          status?: string;
          results?: Array<{
            formatted_address?: string;
            geometry?: { location?: { lat?: number; lng?: number } };
          }>;
        } | null;

        if (data?.status === "OK" && data?.results?.length) {
          return data.results
            .filter(
              (r) =>
                r?.formatted_address?.trim() &&
                Number.isFinite(r?.geometry?.location?.lat) &&
                Number.isFinite(r?.geometry?.location?.lng)
            )
            .slice(0, 6)
            .map((r) => ({
              lat: r.geometry!.location!.lat as number,
              lng: r.geometry!.location!.lng as number,
              label: formatGeocodeLabel(r.formatted_address!),
            }));
        }
      }
    } catch {
      /* lanjut Nominatim */
    }
  }

  try {
    const url = new URL(`${NOMINATIM}/search`);
    url.searchParams.set("q", q);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "6");
    url.searchParams.set("countrycodes", "id");

    if (nearLat != null && nearLng != null) {
      const delta = 0.12;
      url.searchParams.set(
        "viewbox",
        `${nearLng - delta},${nearLat + delta},${nearLng + delta},${nearLat - delta}`
      );
      url.searchParams.set("bounded", "0");
    }

    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, cache: "no-store" });
    if (!res.ok) return [];

    const rows = (await res.json().catch(() => [])) as Array<{
      lat?: string;
      lon?: string;
      display_name?: string;
    }>;

    return rows
      .filter((r) => r?.lat && r?.lon && r?.display_name?.trim())
      .map((r) => ({
        lat: Number(r.lat),
        lng: Number(r.lon),
        label: formatGeocodeLabel(r.display_name!),
      }))
      .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
  } catch {
    return [];
  }
}

function buildBounds(lat: number, lng: number): string {
  const d = 0.15;
  return `${lat - d},${lng - d}|${lat + d},${lng + d}`;
}
