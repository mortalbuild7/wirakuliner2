# Domain wirakuliner.web.id

Domain sudah ditambahkan ke project Vercel **wirakuliner2**.

## DNS di registrar domain (.web.id)

Login ke panel DNS domain Anda (PANDI / registrar tempat beli `.web.id`), lalu tambahkan:

### Opsi A — Record A (disarankan)

| Type | Name / Host | Value | TTL |
|------|-------------|--------|-----|
| **A** | `@` (atau kosong) | `76.76.21.21` | 3600 |
| **A** | `www` | `76.76.21.21` | 3600 |

### Opsi B — Nameserver Vercel

Ganti nameserver domain menjadi:

- `ns1.vercel-dns.com`
- `ns2.vercel-dns.com`

(Vercel mengelola semua DNS.)

## Cek status

- Vercel: https://vercel.com/mortalbuild7s-projects/wirakuliner2/settings/domains
- Setelah DNS aktif (biasanya 5 menit–48 jam), buka: **https://wirakuliner.web.id**

## Supabase Auth

Setelah domain hidup, `site_url` di Supabase sudah diarahkan ke `https://wirakuliner.web.id`.

Jika login gagal, cek:  
https://supabase.com/dashboard/project/voswtzwrsjmgeqmyboix/auth/url-configuration

## URL aplikasi

| URL | Keterangan |
|-----|------------|
| https://wirakuliner.web.id | Domain utama (setelah DNS) |
| https://www.wirakuliner.web.id | Alias www |
| https://wirakuliner2.vercel.app | Vercel default (tetap jalan) |
