# Panduan RLS Supabase — Anti IDOR (WIRA Kuliner)

Row Level Security (RLS) memastikan query dari client Supabase (anon/authenticated)
hanya mengembalikan baris yang `auth.uid()` berhak akses.

## Tabel `orders`

Kebijakan aktif: `orders_select_participants` (lihat migration `000014`).

| Peran | Kondisi akses SELECT |
|-------|---------------------|
| Customer | `customer_id = auth.uid()` |
| Merchant | `merchant_id` dimiliki `merchants.owner_id = auth.uid()` |
| Driver | `driver_id` terhubung `drivers.profile_id = auth.uid()` |
| Driver pool | Order belum ada driver + status eligible + dalam radius pool |
| Admin | `is_admin()` |

**UPDATE:** Hanya participant (customer/merchant/driver terkait) — lihat `orders_update_participants`.

### Contoh validasi di Route Handler (lapisan aplikasi)

```typescript
const { data: { user } } = await supabase.auth.getUser();
if (!user) return 401;

const { data: order } = await admin.from("orders").select("customer_id, driver_id").eq("id", orderId).single();

// Anti IDOR: bandingkan ID dari JWT, bukan dari body
if (order.driver_id !== authenticatedDriver.id) return 403;
```

Implementasi lengkap: `src/app/api/orders/complete/route.ts`

## Tabel `wallet_withdrawals` (withdrawals)

Migration `000027`:

- **SELECT:** User hanya melihat penarikan miliknya (`owner_type` + `owner_id` cocok dengan `auth.uid()` / relasi driver/merchant).
- **INSERT:** Diblokir untuk `authenticated` — insert hanya via RPC `handle_withdraw` / service role.

Ini mencegah user A membaca riwayat withdraw user B meskipun menebak UUID.

## Tabel `wallets` / `wallet_transactions`

Mutasi saldo hanya via RPC `wallet_apply_tx` / `handle_withdraw` (SECURITY DEFINER + service_role).
Client tidak boleh UPDATE langsung.

## Checklist deploy

1. `supabase db push` — terapkan migration RLS terbaru.
2. Pastikan API Route Handler selalu `getUser()` / `getAuthDriver()` sebelum mengubah data.
3. Jangan kirim `driver_id` / `customer_id` dari frontend — gunakan `rejectTrustedOwnerIdsInBody`.
