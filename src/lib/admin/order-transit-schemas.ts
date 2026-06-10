import { z } from "zod";
import { SERVICE_TYPES } from "@/lib/service-types";

/** Kontak & dimensi paket — wajib hanya jika serviceType = PAKET (superRefine). */
const packageDetailsSchema = z.object({
  senderName: z.string().trim().min(2, "Nama pengirim wajib").max(120),
  senderPhone: z.string().trim().min(8, "HP pengirim wajib").max(20),
  recipientName: z.string().trim().min(2, "Nama penerima wajib").max(120),
  recipientPhone: z.string().trim().min(8, "HP penerima wajib").max(20),
  packageType: z.string().trim().min(2, "Jenis barang wajib").max(80),
  weightKg: z.coerce.number().positive("Berat harus > 0").max(500),
  lengthCm: z.coerce.number().positive("Panjang harus > 0").max(300),
  widthCm: z.coerce.number().positive("Lebar harus > 0").max(300),
  heightCm: z.coerce.number().positive("Tinggi harus > 0").max(300),
});

/**
 * Skema pengajuan order transit (NGOJEK / NGOMOBIL / PAKET).
 * Validasi kondisional PAKET via superRefine — frontend tidak bisa skip field paket.
 */
export const createTransitOrderSchema = z
  .object({
    serviceType: z.enum(SERVICE_TYPES),
    pickupAddress: z.string().trim().min(3).max(300),
    destinationAddress: z.string().trim().min(3).max(300),
    pickupLat: z.coerce.number().min(-90).max(90),
    pickupLng: z.coerce.number().min(-180).max(180),
    destinationLat: z.coerce.number().min(-90).max(90),
    destinationLng: z.coerce.number().min(-180).max(180),
    paymentMethod: z.enum(["wallet", "gateway"]).optional(),
    packageDetails: packageDetailsSchema.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.serviceType !== "PAKET") return;

    if (!data.packageDetails) {
      ctx.addIssue({
        code: "custom",
        message: "Detail paket wajib untuk layanan PAKET",
        path: ["packageDetails"],
      });
      return;
    }

    const { lengthCm, widthCm, heightCm } = data.packageDetails;
    const volume = lengthCm * widthCm * heightCm;
    if (volume <= 0) {
      ctx.addIssue({
        code: "custom",
        message: "Dimensi paket tidak valid",
        path: ["packageDetails"],
      });
    }
  });

export type CreateTransitOrderInput = z.infer<typeof createTransitOrderSchema>;
