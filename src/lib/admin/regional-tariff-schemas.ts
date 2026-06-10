import { z } from "zod";
import { SERVICE_TYPES } from "@/lib/service-types";

/** Anti parameter tampering — hanya field whitelist, angka non-negatif. */
export const updateRegionalTariffSchema = z
  .object({
    tariffId: z.string().uuid("ID tarif tidak valid").optional(),
    serviceType: z.enum(SERVICE_TYPES).default("NGOJEK"),
    provinceId: z.coerce.number().int().positive("province_id wajib positif"),
    cityId: z
      .union([z.coerce.number().int().positive(), z.null(), z.literal("")])
      .optional()
      .transform((v) => (v === "" || v === undefined ? null : v)),
    baseFare: z.coerce
      .number()
      .min(0, "Tarif dasar tidak boleh negatif")
      .max(500_000, "Tarif dasar terlalu besar"),
    pricePerKm: z.coerce
      .number()
      .min(0, "Harga per km tidak boleh negatif")
      .max(100_000, "Harga per km terlalu besar"),
    merchantMarkup: z.coerce
      .number()
      .min(0, "Markup tidak boleh negatif")
      .max(50_000, "Markup terlalu besar"),
  })
  .strict();

export type UpdateRegionalTariffInput = z.infer<typeof updateRegionalTariffSchema>;
