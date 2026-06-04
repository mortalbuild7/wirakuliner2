# Upload ke GitHub — WIRA Kuliner

Proyek sudah siap Git lokal (branch `main`, commit awal).  
**`.env.local` tidak ikut commit** (rahasia API tetap di komputer Anda).

## Langkah 1 — Login GitHub (sekali)

Buka PowerShell:

```powershell
gh auth login
```

Pilih:
- **GitHub.com**
- **HTTPS**
- Login lewat **browser** (pilih akun **mortalbuild7** atau akun yang dipakai)

Atau login manual:

```powershell
git credential-manager github login --username mortalbuild7
```

## Langkah 2 — Buat repo & push (otomatis)

```powershell
cd C:\projectWebApp\wira-kuliner
gh repo create wira-kuliner --public --source=. --remote=origin --push --description "WIRA Kuliner - multi-merchant food delivery (Next.js + Supabase)"
```

Jika repo `mortalbuild7/wira-kuliner` **sudah ada** di GitHub, cukup:

```powershell
cd C:\projectWebApp\wira-kuliner
git push -u origin main
```

## Langkah 2 alternatif — Lewat website GitHub

1. Buka https://github.com/new  
2. Nama repo: **wira-kuliner** (Public)  
3. **Jangan** centang “Add README” (sudah ada di lokal)  
4. Create repository  
5. Jalankan:

```powershell
cd C:\projectWebApp\wira-kuliner
git remote set-url origin https://github.com/USERNAME/wira-kuliner.git
git push -u origin main
```

Ganti `USERNAME` dengan username GitHub Anda.

## Setelah online

- Kode: `https://github.com/mortalbuild7/wira-kuliner` (sesuaikan username)
- Deploy frontend: [Vercel](https://vercel.com) → import repo → set env dari `.env.local.example`
- Database: Supabase project `voswtzwrsjmgeqmyboix` (sudah terhubung)

## Env di Vercel (wajib)

| Variable | Nilai |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://voswtzwrsjmgeqmyboix.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | secret key (server only) |

Jangan commit secret key ke GitHub.
