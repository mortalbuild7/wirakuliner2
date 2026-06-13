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

/**
 * Reverse geocode koordinat → label alamat.
 * Urutan: Google (jika key ada) → Nominatim OSM (default gratis).
 */
export async function reverseGeocodeCoords(
  lat: number,
  lng: number
): Promise<GeocodeHit | null> {
  const gKey = googleKey();
  if (gKey) {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("latlng", `${lat},${lng}`);
    url.searchParams.set("key", gKey);
    url.searchParams.set("language", "id");
    url.searchParams.set("result_type", "street_address|route|premise|subpremise");

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as {
        status?: string;
        results?: Array<{ formatted_address?: string; geometry?: { location?: { lat: number; lng: number } } }>;
      };
      if (data.status === "OK" && data.results?.[0]?.formatted_address) {
        const r = data.results[0];
        const loc = r.geometry?.location;
        return {
          lat: loc?.lat ?? lat,
          lng: loc?.lng ?? lng,
          label: formatGeocodeLabel(r.formatted_address!),
        };
      }
      if (data.status === "OVER_QUERY_LIMIT") {
        throw new Error("Kuota API geocoding habis — coba lagi nanti");
      }
    }
  }

  // Fallback Nominatim — instan tanpa API key
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

  if (!data?.display_name) return null;

  return {
    lat: Number(data.lat),
    lng: Number(data.lon),
    label: formatGeocodeLabel(data.display_name),
  };
}

/**
 * Forward geocode / autocomplete — Google (opsional) atau Nominatim.
 * Dipakai LocationSearchBar untuk pesan jemput orang lain.
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
      const data = (await res.json()) as {
        status?: string;
        results?: Array<{
          formatted_address?: string;
          geometry?: { location?: { lat: number; lng: number } };
        }>;
      };
      if (data.status === "OVER_QUERY_LIMIT") {
        throw new Error("Kuota API geocoding habis — coba lagi nanti");
      }
      if (data.status === "OK" && data.results?.length) {
        return data.results
          .filter((r) => r.formatted_address && r.geometry?.location)
          .slice(0, 6)
          .map((r) => ({
            lat: r.geometry!.location!.lat,
            lng: r.geometry!.location!.lng,
            label: formatGeocodeLabel(r.formatted_address!),
          }));
      }
    }
  }

  // Nominatim search — gratis, countrycodes=id
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
    .filter((r) => r.lat && r.lon && r.display_name)
    .map((r) => ({
      lat: Number(r.lat),
      lng: Number(r.lon),
      label: formatGeocodeLabel(r.display_name!),
    }))
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

/** Bounding box kasar sekitar titik referensi — prioritas hasil dekat pengguna. */
function buildBounds(lat: number, lng: number): string {
  const d = 0.15;
  return `${lat - d},${lng - d}|${lat + d},${lng + d}`;
}
