import { z } from "zod";

/** Hanya digit + spasi strip untuk rekening — cegah injeksi teks arbitrer. */
const bankAccountPattern = /^[0-9][0-9\s-]{5,30}$/;

/**
 * Skema penarikan dana aplikasi ke bank.
 * `.strict()` mencegah mass-assignment field ilegal dari form client.
 */
export const appWithdrawalSchema = z
  .object({
    amount: z.coerce
      .number()
      .positive("Nominal harus lebih dari 0")
      .max(500_000_000, "Maksimal penarikan Rp 500.000.000"),
    bankName: z
      .string()
      .trim()
      .min(2, "Nama bank minimal 2 karakter")
      .max(80, "Nama bank terlalu panjang"),
    accountNumber: z
      .string()
      .trim()
      .regex(bankAccountPattern, "Nomor rekening tidak valid"),
    accountHolder: z
      .string()
      .trim()
      .min(2, "Nama pemilik rekening minimal 2 karakter")
      .max(120, "Nama pemilik terlalu panjang"),
    note: z
      .string()
      .trim()
      .max(500, "Catatan maksimal 500 karakter")
      .optional()
      .or(z.literal("")),
  })
  .strict();

export type AppWithdrawalInput = z.infer<typeof appWithdrawalSchema>;

export const cashflowDateFilterSchema = z
  .object({
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal dari: YYYY-MM-DD")
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal sampai: YYYY-MM-DD")
      .optional(),
  })
  .strict();
