# Koneksi Supabase — voswtzwrsjmgeqmyboix

## Sudah dikonfigurasi di proyek

| File | Isi |
|------|-----|
| `.env.local` | `NEXT_PUBLIC_SUPABASE_URL` + publishable key |
| `supabase/config.toml` | `project_id = voswtzwrsjmgeqmyboix` |
| `supabase/.temp/project-ref` | Project ref untuk CLI |

## Yang harus Anda jalankan di PowerShell (sekali)

### 1. Login CLI (browser)

```powershell
cd C:\projectWebApp\wira-kuliner
npx supabase login
```

### 2. Link project (setelah login)

```powershell
npx supabase link --project-ref voswtzwrsjmgeqmyboix
```

Masukkan **database password** project (dari Dashboard → Settings → Database, bukan `[YOUR-PASSWORD]` placeholder).

### 3. Push schema (migrations)

```powershell
npx supabase db push
```

### 4. Service role (untuk API server & Edge Function)

Dashboard → **Settings** → **API** → copy **service_role** (secret) ke `.env.local`:

```
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Jangan commit file ini.

### 5. Jalankan app

```powershell
npm run dev
```

Buka http://localhost:3000

---

## Connection string PostgreSQL

```
postgresql://postgres:[PASSWORD]@db.voswtzwrsjmgeqmyboix.supabase.co:5432/postgres
```

Ganti `[PASSWORD]` dengan password database Anda (sama saat `supabase link`).

---

## Cek koneksi dari app

Setelah `.env.local` terisi, buka `/login` dan daftar user di Supabase Dashboard → Authentication, lalu set role di tabel `profiles` (`admin` / `merchant` / `customer`).

---

## API keys

- **Publishable** (`sb_publishable_...`) → sudah di `NEXT_PUBLIC_SUPABASE_ANON_KEY` (frontend)
- **Service role** → hanya server / Vercel env, jangan dipasang di client
