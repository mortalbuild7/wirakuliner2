import { copyFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = dirname(fileURLToPath(import.meta.url));
const dest = resolve(root, "android/app/google-services.json");

const sources = [
  process.env.GOOGLE_SERVICES_JSON,
  resolve(root, "google-services.json"),
  resolve(process.env.USERPROFILE ?? "", "Downloads/google-services (1).json"),
  resolve(process.env.USERPROFILE ?? "", "Downloads/google-services.json"),
].filter(Boolean);

const src = sources.find((p) => existsSync(p));
if (!src) {
  console.error("google-services.json tidak ditemukan.");
  console.error("Salin dari Firebase ke driver-app/google-services.json");
  process.exit(1);
}

copyFileSync(src, dest);
console.log("Copied:", src, "->", dest);
