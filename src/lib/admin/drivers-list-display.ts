import type { Driver } from "@/types/database";

type EmbedName = { name: string } | { name: string }[] | null;

export type DriverCityDisplayRow = Pick<Driver, "city_id"> & {
  service_cities?: EmbedName;
  registration_sc?: EmbedName;
  cities?: EmbedName;
};

function embedName(embed?: EmbedName): string | null {
  if (!embed) return null;
  if (Array.isArray(embed)) return embed[0]?.name ?? null;
  return embed.name ?? null;
}

/** Label kota untuk tabel — tidak pernah menggugurkan baris driver jika relasi null. */
export function resolveDriverCityLabel(d: DriverCityDisplayRow): string {
  const fromService = embedName(d.service_cities);
  const fromRegistration = embedName(d.registration_sc);
  const fromCity = embedName(d.cities);

  const raw =
    fromService?.split(",")[0]?.trim() ||
    fromRegistration?.split(",")[0]?.trim() ||
    fromCity?.trim() ||
    null;

  if (raw) return raw;

  if (d.city_id != null) return `Kota ID ${d.city_id}`;
  return "Kota Belum Diatur";
}
