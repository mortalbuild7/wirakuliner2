import { z } from "zod";
import { sanitizeChatMessageForStorage } from "@/lib/privacy/chat-sanitize";

/** Whitelist field — cegah over-posting / parameter tampering. */
export const sendChatMessageSchema = z
  .object({
    orderId: z.string().uuid("ID pesanan tidak valid"),
    message: z
      .string()
      .min(1, "Pesan tidak boleh kosong")
      .max(1000, "Pesan maksimal 1000 karakter")
      .refine(
        (m) => !/<\s*(script|iframe|object|embed)/i.test(m),
        "Pesan mengandung konten tidak diizinkan"
      ),
  })
  .strict()
  .transform((data) => {
    const sanitized = sanitizeChatMessageForStorage(data.message, 1000);
    if (!sanitized) {
      throw new z.ZodError([
        {
          code: "custom",
          message: "Pesan tidak valid setelah sterilisasi",
          path: ["message"],
        },
      ]);
    }
    return { orderId: data.orderId, message: sanitized };
  });

export type SendChatMessageInput = z.infer<typeof sendChatMessageSchema>;
