/**
 * Layanan transit nasional — satu sumber kebenaran tipe ENUM (sinkron dengan PostgreSQL).
 * Anti-Redundancy: service_type (permintaan customer) ≠ service_category (kendaraan fisik driver).
 */

/** Jenis layanan yang dapat dipesan customer. */
export const SERVICE_TYPES = ["NGOJEK", "NGOMOBIL", "PAKET"] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

/** Kategori kendaraan fisik yang dimiliki driver (satu driver = satu kategori). */
export const DRIVER_SERVICE_CATEGORIES = [
  "MOTOR_HYBRID",
  "MOBIL_PASSENGER",
  "MOBIL_CARGO",
] as const;
export type DriverServiceCategory = (typeof DRIVER_SERVICE_CATEGORIES)[number];

/** Batas kubus 40×40×40 cm — di atas ini PAKET wajib MOBIL_CARGO. */
export const PAKET_CARGO_VOLUME_THRESHOLD_CM3 = 40 * 40 * 40;

export const SERVICE_TYPE_LABEL: Record<ServiceType, string> = {
  NGOJEK: "NGOJEK (Motor)",
  NGOMOBIL: "NGOMOBIL (Mobil Penumpang)",
  PAKET: "PAKET (Kirim Barang)",
};

export const DRIVER_CATEGORY_LABEL: Record<DriverServiceCategory, string> = {
  MOTOR_HYBRID: "Motor (Hybrid)",
  MOBIL_PASSENGER: "Mobil Penumpang",
  MOBIL_CARGO: "Mobil Box / Pickup",
};

/**
 * Menentukan kategori kendaraan fisik dari jenis layanan + volume paket.
 * MOBIL_PASSENGER tidak pernah dipilih untuk PAKET (hanya MOTOR atau MOBIL_CARGO).
 */
export function resolveDriverCategoryForService(
  serviceType: ServiceType,
  packageVolumeCm3 = 0
): DriverServiceCategory {
  if (serviceType === "NGOJEK") return "MOTOR_HYBRID";
  if (serviceType === "NGOMOBIL") return "MOBIL_PASSENGER";
  if (packageVolumeCm3 > PAKET_CARGO_VOLUME_THRESHOLD_CM3) return "MOBIL_CARGO";
  return "MOTOR_HYBRID";
}

/** Hitung volume kubikasi dari dimensi (cm) — server-side only untuk anti-tampering. */
export function computePackageVolumeCm3(
  lengthCm: number,
  widthCm: number,
  heightCm: number
): number {
  const vol = lengthCm * widthCm * heightCm;
  return Number.isFinite(vol) && vol > 0 ? Math.round(vol * 100) / 100 : 0;
}

export function isServiceType(value: unknown): value is ServiceType {
  return typeof value === "string" && SERVICE_TYPES.includes(value as ServiceType);
}
