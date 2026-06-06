/**
 * Resize generated brand masters into web + driver-expo asset sizes.
 * Usage: node scripts/resize-brand-assets.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const MASTERS = path.join(ROOT, "brand-masters");

const WEB_ICON = path.join(MASTERS, "wira-icon-master.png");
const DRIVER_ICON = path.join(MASTERS, "wira-driver-icon-master.png");
const DRIVER_SPLASH = path.join(MASTERS, "wira-driver-splash-master.png");

const PUBLIC = path.join(ROOT, "public");
const APP = path.join(ROOT, "src", "app");
const DRIVER_ASSETS = path.join(ROOT, "driver-expo", "assets");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function writePng(src, dest, size, opts = {}) {
  ensureDir(path.dirname(dest));
  let img = sharp(src);
  if (opts.fit === "contain") {
    img = img.resize(size, size, {
      fit: "contain",
      background: opts.background ?? { r: 15, g: 23, b: 42, alpha: 1 },
    });
  } else {
    img = img.resize(size, size, { fit: "cover", position: "centre" });
  }
  await img.png({ compressionLevel: 9 }).toFile(dest);
  console.log(`  ${path.relative(ROOT, dest)} (${size}px)`);
}

async function writeSplash(src, dest, width) {
  ensureDir(path.dirname(dest));
  await sharp(src)
    .resize(width, null, { fit: "inside", withoutEnlargement: false })
    .png({ compressionLevel: 9 })
    .toFile(dest);
  console.log(`  ${path.relative(ROOT, dest)} (w=${width})`);
}

async function writeSolidBg(dest, size, hex = "#0f172a") {
  ensureDir(path.dirname(dest));
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: hex,
    },
  })
    .png()
    .toFile(dest);
  console.log(`  ${path.relative(ROOT, dest)} (solid ${hex})`);
}

async function writeMonochrome(src, dest, size) {
  ensureDir(path.dirname(dest));
  await sharp(src)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .grayscale()
    .threshold(128)
    .png()
    .toFile(dest);
  console.log(`  ${path.relative(ROOT, dest)} (mono ${size}px)`);
}

async function main() {
  for (const f of [WEB_ICON, DRIVER_ICON, DRIVER_SPLASH]) {
    if (!fs.existsSync(f)) {
      console.error(`Missing: ${f}`);
      process.exit(1);
    }
  }

  console.log("Web favicon & icons...");
  ensureDir(PUBLIC);
  ensureDir(APP);
  await writePng(WEB_ICON, path.join(PUBLIC, "favicon.png"), 32);
  await writePng(WEB_ICON, path.join(PUBLIC, "icon-192.png"), 192);
  await writePng(WEB_ICON, path.join(PUBLIC, "icon-512.png"), 512);
  await writePng(WEB_ICON, path.join(PUBLIC, "apple-touch-icon.png"), 180);
  await writePng(WEB_ICON, path.join(APP, "icon.png"), 512);
  await writePng(WEB_ICON, path.join(APP, "apple-icon.png"), 180);

  console.log("Driver Expo assets...");
  ensureDir(DRIVER_ASSETS);
  await writePng(DRIVER_ICON, path.join(DRIVER_ASSETS, "icon.png"), 1024, {
    fit: "contain",
    background: { r: 15, g: 23, b: 42, alpha: 1 },
  });
  await writePng(DRIVER_ICON, path.join(DRIVER_ASSETS, "android-icon-foreground.png"), 1024, {
    fit: "contain",
    background: { r: 15, g: 23, b: 42, alpha: 0 },
  });
  await writeSolidBg(path.join(DRIVER_ASSETS, "android-icon-background.png"), 1024);
  await writeMonochrome(DRIVER_ICON, path.join(DRIVER_ASSETS, "android-icon-monochrome.png"), 432);
  await writePng(DRIVER_ICON, path.join(DRIVER_ASSETS, "favicon.png"), 48);
  await writeSplash(DRIVER_SPLASH, path.join(DRIVER_ASSETS, "splash-icon.png"), 400);
  await writePng(DRIVER_SPLASH, path.join(DRIVER_ASSETS, "logo.png"), 512, {
    fit: "contain",
    background: { r: 15, g: 23, b: 42, alpha: 0 },
  });

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
