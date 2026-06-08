import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * RACE CONDITION — withdraw/topup simultan.
 *
 * PostgreSQL Row-Level Locking: SELECT ... FOR UPDATE
 * - Request withdraw #1 mengunci baris wallet driver.
 * - Request withdraw #2 (milidetik kemudian) MENUNGGU di FOR UPDATE.
 * - Setelah #1 commit, #2 membaca saldo terbaru → saldo tidak cukup → ditolak.
 *
 * Prisma: gunakan interactive transaction + $queryRaw untuk FOR UPDATE
 * (Prisma ORM biasa tidak expose FOR UPDATE pada findUnique).
 */

type OwnerType = "customer" | "driver" | "merchant";

export async function withdrawWallet(params: {
  ownerType: OwnerType;
  ownerId: string;
  amount: number;
  note?: string;
}): Promise<{ balance: number; txId: string }> {
  if (params.amount <= 0) {
    throw new Error("Amount harus positif");
  }

  return prisma.$transaction(async (tx) => {
    // --- LOCK: baris wallet dikunci sampai transaction selesai ---
    const rows = await tx.$queryRaw<
      { id: string; balance: Prisma.Decimal }[]
    >`
      SELECT id, balance
      FROM wallets
      WHERE owner_type = ${params.ownerType}::wallet_owner_type
        AND owner_id = ${params.ownerId}::uuid
      FOR UPDATE
    `;

    let wallet = rows[0];
    if (!wallet) {
      // Buat wallet kosong lalu lock (dalam transaction yang sama)
      await tx.$executeRaw`
        INSERT INTO wallets (owner_type, owner_id, balance)
        VALUES (${params.ownerType}::wallet_owner_type, ${params.ownerId}::uuid, 0)
        ON CONFLICT (owner_type, owner_id) DO NOTHING
      `;
      const locked = await tx.$queryRaw<
        { id: string; balance: Prisma.Decimal }[]
      >`
        SELECT id, balance FROM wallets
        WHERE owner_type = ${params.ownerType}::wallet_owner_type
          AND owner_id = ${params.ownerId}::uuid
        FOR UPDATE
      `;
      wallet = locked[0];
    }

    const current = Number(wallet.balance);
    const next = current - params.amount;
    if (next < 0) {
      throw new Error("Saldo tidak mencukupi");
    }

    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: next },
    });

    const ledger = await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        txType: "withdraw_ewallet",
        amount: -params.amount,
        balanceAfter: next,
        note: params.note ?? "Penarikan saldo",
      },
    });

    return { balance: next, txId: ledger.id };
  });
}

/**
 * PARAMETERIZED QUERIES — Prisma selalu memakai prepared statements.
 * Hindari: prisma.$queryRawUnsafe(`SELECT * FROM wallets WHERE id = '${id}'`)
 */

export async function searchProducts(params: {
  q?: string;
  limit: number;
  offset: number;
}) {
  return prisma.product.findMany({
    where: params.q
      ? { name: { contains: params.q, mode: "insensitive" }, isAvailable: true }
      : { isAvailable: true },
    take: params.limit,
    skip: params.offset,
    orderBy: { name: "asc" },
    select: { id: true, name: true, price: true, merchantId: true },
  });
}
