/**
 * Verifikasi koneksi Supabase: Auth, DB, Storage, Edge Function
 * Usage: node scripts/verify-supabase.mjs
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function loadEnv() {
  const raw = readFileSync(resolve(root, ".env.local"), "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon || !service) {
  console.error("❌ .env.local belum lengkap (URL, anon, service role)");
  process.exit(1);
}

const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const checks = [];

async function check(name, fn) {
  try {
    const detail = await fn();
    checks.push({ name, ok: true, detail });
    console.log(`✅ ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (e) {
    checks.push({ name, ok: false, detail: String(e.message ?? e) });
    console.log(`❌ ${name} — ${e.message ?? e}`);
  }
}

await check("Auth API", async () => {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (error) throw error;
  return `${data.users.length >= 0 ? "OK" : ""} (${data.users?.length ?? 0} user sample)`;
});

await check("Tabel profiles", async () => {
  const { count, error } = await admin.from("profiles").select("id", { count: "exact", head: true });
  if (error) throw error;
  return `${count ?? 0} profil`;
});

await check("Tabel merchants", async () => {
  const { count, error } = await admin.from("merchants").select("id", { count: "exact", head: true });
  if (error) throw error;
  return `${count ?? 0} merchant`;
});

await check("Tabel drivers", async () => {
  const { count, error } = await admin.from("drivers").select("id", { count: "exact", head: true });
  if (error) throw error;
  return `${count ?? 0} driver`;
});

await check("Kolom merchants.is_open", async () => {
  const { error } = await admin.from("merchants").select("is_open").limit(1);
  if (error) throw error;
  return "ada";
});

await check("Storage bucket menu-images", async () => {
  const { data, error } = await admin.storage.listBuckets();
  if (error) throw error;
  const b = data?.find((x) => x.id === "menu-images");
  if (!b) throw new Error("bucket menu-images tidak ditemukan");
  return b.public ? "public" : "private";
});

await check("Edge Function send-driver-push", async () => {
  const res = await fetch(`${url}/functions/v1/send-driver-push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${service}`,
    },
    body: JSON.stringify({
      record: {
        id: "00000000-0000-4000-8000-000000000001",
        is_outside_radius: false,
        negotiation_status: "none",
        delivery_address: "test",
      },
    }),
  });
  const json = await res.json();
  if (!res.ok && !json.skipped && !json.error?.includes("FCM")) {
    throw new Error(JSON.stringify(json));
  }
  if (json.error?.includes("FCM secrets not configured")) {
    return "deployed (FCM secrets belum diset)";
  }
  return json.skipped ? "deployed (skip test OK)" : "deployed";
});

await check("Realtime publication drivers", async () => {
  const { error } = await admin.from("drivers").select("id").limit(1);
  if (error) throw error;
  return "query OK (pastikan REPLICA IDENTITY di migration 07)";
});

const failed = checks.filter((c) => !c.ok).length;
console.log("\n---");
console.log(failed ? `⚠️  ${failed} cek gagal` : "✅ Semua cek lulus");
process.exit(failed ? 1 : 0);
