/**
 * Buat user pertama tanpa Supabase Dashboard (jika "Failed to fetch").
 *
 * 1. Dashboard → Settings → API → copy service_role (secret)
 * 2. Tambah ke .env.local: SUPABASE_SERVICE_ROLE_KEY=eyJ...
 * 3. Jalankan:
 *    node scripts/create-first-user.mjs admin@wira.local PasswordKuat123 admin
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnvLocal() {
  const path = join(root, ".env.local");
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

const env = { ...process.env, ...loadEnvLocal() };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

const email = process.argv[2] ?? "admin@wira.local";
const password = process.argv[3] ?? "PasswordKuat123";
const role = process.argv[4] ?? "admin";

if (!url || !serviceKey) {
  console.error(
    "Isi .env.local:\n  NEXT_PUBLIC_SUPABASE_URL\n  SUPABASE_SERVICE_ROLE_KEY (dari Dashboard → Settings → API)"
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: user, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { name: "Admin WIRA", role },
});

if (error) {
  console.error("Gagal:", error.message);
  process.exit(1);
}

const uid = user.user.id;
const { error: profileErr } = await supabase.from("profiles").upsert({
  id: uid,
  email,
  name: "Admin WIRA",
  role,
});

if (profileErr) {
  console.warn("User dibuat, profile:", profileErr.message);
}

console.log("Berhasil!");
console.log("  Email   :", email);
console.log("  Password:", password);
console.log("  Role    :", role);
console.log("  UID     :", uid);
console.log("Login di http://localhost:3000/login");
