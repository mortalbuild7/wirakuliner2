import { formatGeocodeLabel, type GeocodeHit } from "@/lib/geocode";
import {
  enforceMethod,
  enforceRateLimit,
  secureJsonResponse,
} from "@/lib/security/enforce";
import { parseBoundedNumber, sanitizeText } from "@/lib/security/validate";

const NOMINATIM = "https://nominatim.openstreetmap.org";
const USER_AGENT = "WIRAKuliner/1.0 (https://wirakuliner.web.id; contact@mortalbuild7)";

/** Geocoding alamat ↔ koordinat via Nominatim (OSM). */
export async function GET(req: Request) {
  const methodBlock = enforceMethod(req, ["GET"]);
  if (methodBlock) return methodBlock;
  const rl = enforceRateLimit(req, "geocode", { limit: 30, windowMs: 60_000 });
  if (rl) return rl;

  const { searchParams } = new URL(req.url);
  const reverse = searchParams.get("reverse") === "1";
  const lat = parseBoundedNumber(Number(searchParams.get("lat")), -90, 90);
  const lng = parseBoundedNumber(Number(searchParams.get("lng")), -180, 180);

  if (reverse) {
    if (lat == null || lng == null) {
      return secureJsonResponse({ error: "Koordinat tidak valid" }, { status: 400 });
    }

    const url = new URL(`${NOMINATIM}/reverse`);
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("format", "json");
    url.searchParams.set("zoom", "18");
    url.searchParams.set("addressdetails", "1");

    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) {
      return secureJsonResponse({ error: "Gagal mencari alamat" }, { status: 502 });
    }

    const data = (await res.json().catch(() => null)) as {
      display_name?: string;
      lat?: string;
      lon?: string;
    } | null;

    if (!data?.display_name) {
      return secureJsonResponse({ results: [] });
    }

    const hit: GeocodeHit = {
      lat: Number(data.lat),
      lng: Number(data.lon),
      label: formatGeocodeLabel(data.display_name),
    };

    return secureJsonResponse({ results: [hit] });
  }

  const q = sanitizeText(searchParams.get("q"), 200);
  if (!q || q.length < 3) {
    return secureJsonResponse({ error: "Alamat terlalu pendek" }, { status: 400 });
  }

  const nearLat = parseBoundedNumber(Number(searchParams.get("nearLat")), -90, 90);
  const nearLng = parseBoundedNumber(Number(searchParams.get("nearLng")), -180, 180);

  const url = new URL(`${NOMINATIM}/search`);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "6");
  url.searchParams.set("countrycodes", "id");
  url.searchParams.set("addressdetails", "0");

  if (nearLat != null && nearLng != null) {
    const delta = 0.12;
    url.searchParams.set(
      "viewbox",
      `${nearLng - delta},${nearLat + delta},${nearLng + delta},${nearLat - delta}`
    );
    url.searchParams.set("bounded", "0");
  }

  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    return secureJsonResponse({ error: "Gagal mencari lokasi" }, { status: 502 });
  }

  const rows = (await res.json().catch(() => [])) as Array<{
    lat?: string;
    lon?: string;
    display_name?: string;
  }>;

  const results: GeocodeHit[] = rows
    .filter((r) => r.lat && r.lon && r.display_name)
    .map((r) => ({
      lat: Number(r.lat),
      lng: Number(r.lon),
      label: formatGeocodeLabel(r.display_name!),
    }))
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));

  return secureJsonResponse({ results });
}
