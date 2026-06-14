import { EmbedPickupMapClient } from "@/app/embed/pickup-map/embed-pickup-map-client";

export const dynamic = "force-dynamic";

function num(value: string | null | undefined, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export default async function EmbedPickupMapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const get = (key: string) => {
    const v = params[key];
    return Array.isArray(v) ? v[0] : v;
  };

  return (
    <EmbedPickupMapClient
      centerLat={num(get("lat"), -6.4)}
      centerLng={num(get("lng"), 106.8)}
      hubLat={num(get("hubLat"), -6.4)}
      hubLng={num(get("hubLng"), 106.8)}
      showRadius={get("radius") === "1"}
      height={num(get("h"), 240)}
    />
  );
}
