# Deploy WIRA Kuliner ke Vercel

Repo: **https://github.com/mortalbuild7/wirakuliner2**

## Cara tercepat (import GitHub)

1. Buka: **https://vercel.com/new/import?s=https://github.com/mortalbuild7/wirakuliner2**
2. Login Vercel → pilih akun GitHub **mortalbuild7** → import `wirakuliner2`
3. Framework: **Next.js** (otomatis)
4. **Environment Variables** — tambahkan:

| Name | Value |
|------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://voswtzwrsjmgeqmyboix.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_...` (dari Supabase Dashboard) |
| `SUPABASE_SERVICE_ROLE_KEY` | `sb_secret_...` (secret, jangan expose ke client) |

5. Klik **Deploy** — tunggu build selesai (~2–3 menit)

## Setelah deploy — Supabase Auth

Di [Supabase Dashboard](https://supabase.com/dashboard/project/voswtzwrsjmgeqmyboix/auth/url-configuration):

- **Site URL:** `https://YOUR-APP.vercel.app`
- **Redirect URLs:** tambahkan:
  - `https://YOUR-APP.vercel.app/**`
  - `http://localhost:3000/**` (untuk dev lokal)

Ganti `YOUR-APP` dengan domain Vercel (mis. `wirakuliner2.vercel.app`).

## Deploy ulang dari CLI (opsional)

```powershell
cd C:\projectWebApp\wira-kuliner
npx vercel login
npx vercel link
npx vercel env pull   # atau set env di dashboard
npx vercel --prod
```

## Cek build lokal sebelum deploy

```powershell
npm run build
```

Jika build lokal sukses, Vercel biasanya juga sukses.
