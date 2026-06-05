/**
 * Set FCM secrets ke Supabase Edge Functions dari Firebase service account JSON.
 *
 * Usage:
 *   node scripts/setup-fcm-secrets.mjs path/to/firebase-service-account.json
 */
import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { spawnSync } from "child_process";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";
import { join } from "path";
import { randomBytes } from "crypto";

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error("Usage: node scripts/setup-fcm-secrets.mjs <firebase-service-account.json>");
  process.exit(1);
}

const abs = resolve(jsonPath);
const sa = JSON.parse(readFileSync(abs, "utf8"));

const projectId = sa.project_id;
const clientEmail = sa.client_email;
const privateKey = sa.private_key;

if (!projectId || !clientEmail || !privateKey) {
  console.error("JSON tidak valid — butuh project_id, client_email, private_key");
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tmpFile = join(tmpdir(), `fcm-secrets-${randomBytes(4).toString("hex")}.env`);

// Private key pakai literal \n — format yang dibaca Edge Function (replace \\n)
const envLines = [
  `FCM_PROJECT_ID=${projectId}`,
  `FCM_CLIENT_EMAIL=${clientEmail}`,
  `FCM_PRIVATE_KEY="${privateKey.replace(/\r?\n/g, "\\n")}"`,
];
writeFileSync(tmpFile, envLines.join("\n"), "utf8");

console.log("Setting FCM secrets for project:", projectId);
const r = spawnSync(
  "npx",
  ["supabase", "secrets", "set", "--env-file", tmpFile],
  { stdio: "inherit", shell: true, cwd: root }
);

try {
  unlinkSync(tmpFile);
} catch {
  /* ignore */
}

process.exit(r.status ?? 1);
