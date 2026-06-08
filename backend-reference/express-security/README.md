# Referensi Arsitektur Keamanan — Express + Prisma + PostgreSQL

> **Catatan WIRA Kuliner:** Production saat ini memakai **Next.js API Routes + Supabase PostgreSQL**,
> bukan Express. Pola keamanan yang sama sudah diimplementasikan di `src/lib/security/` dan
> `wallet_apply_tx` (SQL `FOR UPDATE`). Folder ini adalah **referensi** jika Anda memisahkan
> backend ke Express di masa depan.

## Pemetaan stack

| Standar keamanan | Express (referensi) | WIRA Kuliner (production) |
|------------------|---------------------|---------------------------|
| Race condition saldo | `prisma.$transaction` + `$queryRaw FOR UPDATE` | RPC `wallet_apply_tx` + `FOR UPDATE` |
| IDOR / BOLA | `auth.middleware.ts` — owner dari JWT | `resolveAuthenticatedOwner`, `resolveWalletOwner` |
| SQL injection | Prisma parameterized | Supabase client + `sql-guard.ts` |
| DoS query | `pagination.middleware.ts` | `parsePagination()` |
| Stored XSS | `validate.middleware.ts` + `xss` | `sanitizePublicText()` |

## Struktur berkas

```
middleware/
  auth.middleware.ts      — JWT verify, attach req.user (JANGAN percaya body owner id)
  rateLimit.middleware.ts — rate limit per IP
  pagination.middleware.ts— limit/offset ketat
  validate.middleware.ts  — express-validator + XSS strip
services/
  wallet.service.ts       — withdraw/topup dengan transaction + row lock
controllers/
  wallet.controller.ts    — endpoint HTTP
prisma/
  schema.prisma           — model Wallet, WalletTransaction
```

## Race condition — inti logika

```sql
-- Dalam satu transaction:
SELECT * FROM wallets WHERE owner_type = $1 AND owner_id = $2 FOR UPDATE;
-- Request kedua (withdraw simultan) BLOCK di sini sampai request pertama COMMIT.
-- Setelah lock, cek balance, debit, insert ledger.
```

Withdraw simultan dari driver yang sama: request #2 menunggu lock, lalu gagal `Saldo tidak mencukupi`.

## Index wajib (PostgreSQL)

Lihat `supabase/migrations/20240603000026_security_indexes.sql`:

- `wallets(owner_type, owner_id)` — lookup FOR UPDATE
- `products(merchant_id, is_available)` — list menu merchant
- `merchants(is_active, admin_suspended, approval_status, category)` — etalase
- GIN trigram pada `merchants.name`, `products.name` — pencarian ILIKE

## Menjalankan referensi Express (opsional)

```bash
cd backend-reference/express-security
npm install
# Set DATABASE_URL, JWT_SECRET
npx prisma migrate dev
npm run dev
```
