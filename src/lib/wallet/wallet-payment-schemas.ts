import { z } from "zod";

/**
 * Whitelist payload checkout wallet — tolak field harga/total/userId dari client.
 * Anti parameter tampering: hanya productId + quantity yang boleh masuk server.
 */
export const walletPaymentItemSchema = z.object({
  productId: z.string().uuid("ID produk tidak valid"),
  quantity: z.coerce
    .number()
    .int("Kuantitas harus bilangan bulat")
    .min(1, "Minimal 1 item")
    .max(99, "Maksimal 99 per produk"),
});

export const payKulinerWithWalletSchema = z
  .object({
    merchantId: z.string().uuid("ID merchant tidak valid"),
    items: z
      .array(walletPaymentItemSchema)
      .min(1, "Keranjang kosong")
      .max(50, "Terlalu banyak item"),
    dineIn: z.boolean().optional(),
    deliveryAddress: z.string().max(500).optional(),
    deliveryLat: z.coerce.number().min(-90).max(90).optional(),
    deliveryLng: z.coerce.number().min(-180).max(180).optional(),
    promoCode: z.string().max(40).optional(),
  })
  .strict();

export type PayKulinerWithWalletInput = z.infer<typeof payKulinerWithWalletSchema>;
