# WIRA Kuliner

Multi-merchant food delivery platform — **Next.js 15** (Vercel) + **Supabase** (PostgreSQL, Auth, Realtime, Storage) + **FCM** via Supabase Edge Functions (no Firebase Cloud Functions).

**Upload ke GitHub:** lihat [GITHUB.md](./GITHUB.md) (login `gh auth login` lalu push).

## Architecture

```
Customer/Merchant/Admin (Next.js on Vercel)
        │
        ▼
Supabase: Auth · PostgreSQL · Realtime · Storage
        │
        ▼ (outside 3km radius → negotiating)
Edge Function send-driver-push → FCM HTTP v1 → Driver mobile app
```

### Geospatial rules (Jalan Wira)

| Distance | Behavior |
|----------|----------|
| ≤ 3 km | Flat delivery fee **Rp 12.000**, instant checkout (Midtrans stub) |
| > 3 km | Negotiation mode — chat + driver fee agreement, then payment unlock |

Reference coordinates: `src/lib/geo-config.ts` and SQL functions `distance_from_jalan_wira()`.

## Project structure

```
wira-kuliner/
├── supabase/
│   ├── migrations/          # PostgreSQL schema + RLS + Haversine
│   ├── functions/
│   │   └── send-driver-push/  # Deno → FCM
│   └── config.toml
├── src/
│   ├── app/
│   │   ├── admin/           # Platform management
│   │   ├── merchant/        # Toko: products, orders, thermal receipt
│   │   ├── customer/        # GoFood-style UX, checkout, tracking
│   │   ├── public-report/   # Unauthenticated transparency
│   │   └── api/             # Payment, receipt, FCM bridge stubs
│   ├── components/
│   ├── lib/
│   └── middleware.ts        # Role-based route protection
└── package.json
```

## Quick start

### 1. Supabase

```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR_REF
supabase db push
supabase functions deploy send-driver-push
```

Set secrets:

```bash
supabase secrets set FCM_PROJECT_ID=... FCM_CLIENT_EMAIL=... FCM_PRIVATE_KEY=...
```

Create a **Database Webhook** on `orders` UPDATE → invoke `send-driver-push` when `negotiation_status = negotiating`.

### 2. Local Next.js

```bash
cp .env.local.example .env.local
npm install
npm run dev
```

### 3. Vercel

Connect GitHub repo → add env vars from `.env.local.example` → deploy.

### 4. Roles

Set `role` in `profiles` via signup metadata or SQL:

- `admin` → `/admin`
- `merchant` → `/merchant` (link `merchants.owner_id`)
- `customer` → `/customer`

## GitHub

```bash
git init
git add .
git commit -m "feat: WIRA Kuliner Supabase + Next.js scaffold"
git remote add origin https://github.com/mortalbuild7/wirakuliner2.git
git push -u origin main
```

## License

Private — WIRA Kuliner platform.
