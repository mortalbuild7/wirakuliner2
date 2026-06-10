import { z } from "zod";

/** Whitelist field — cegah over-posting / parameter tampering. */
export const sendChatMessageSchema = z
  .object({
    orderId: z.string().uuid("ID pesanan tidak valid"),
    message: z
      .string()
      .min(1, "Pesan tidak boleh kosong")
      .max(1000, "Pesan maksimal 1000 karakter"),
  })
  .strict();

export type SendChatMessageInput = z.infer<typeof sendChatMessageSchema>;
