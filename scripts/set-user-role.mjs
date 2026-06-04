/**
 * Ubah role user berdasarkan email (butuh service_role di .env.local)
 *
 * node scripts/set-user-role.mjs your@email.com admin
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
const email = process.argv[2];
const role = process.argv[3] ?? "admin";

if (!email) {
  console.error("Usage: node scripts/set-user-role.mjs EMAIL admin|merchant|customer");
  process.exit(1);
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Tambahkan SUPABASE_SERVICE_ROLE_KEY ke .env.local");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: list, error: listErr } = await supabase.auth.admin.listUsers();
if (listErr) {
  console.error(listErr.message);
  process.exit(1);
}

const user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
if (!user) {
  console.error("User tidak ditemukan:", email);
  process.exit(1);
}

const { error: profileErr } = await supabase.from("profiles").upsert({
  id: user.id,
  email: user.email,
  name: user.user_metadata?.name ?? email.split("@")[0],
  role,
});

if (profileErr) {
  console.error("profiles:", profileErr.message);
  process.exit(1);
}

console.log("OK —", email, "→ role:", role);
console.log("Logout lalu login lagi, atau buka http://localhost:3000/admin");
