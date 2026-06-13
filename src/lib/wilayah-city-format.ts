/** Normalisasi nama kabupaten/kota dari API Kemendagri → format seragam untuk UI & DB. */
export function formatWilayahCityName(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";

  const upper = trimmed.toUpperCase();

  if (upper.startsWith("KOTA ")) {
    return `Kota ${titleCaseWilayah(trimmed.slice(5))}`;
  }
  if (upper.startsWith("KABUPATEN ")) {
    return `Kabupaten ${titleCaseWilayah(trimmed.slice(10))}`;
  }
  if (upper.startsWith("KAB. ")) {
    return `Kabupaten ${titleCaseWilayah(trimmed.slice(5))}`;
  }

  return titleCaseWilayah(trimmed);
}

function titleCaseWilayah(text: string): string {
  return text
    .toLowerCase()
    .split(" ")
    .map((word) =>
      word.length <= 2 && word !== "ii"
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ");
}
