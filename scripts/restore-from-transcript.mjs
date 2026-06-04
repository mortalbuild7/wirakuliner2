/**
 * Restore wira-kuliner files from agent transcript Write + StrReplace history.
 * Usage: node scripts/restore-from-transcript.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const transcript =
  "C:/Users/yayahdaffa/.cursor/projects/c-projectWebApp/agent-transcripts/440fca68-0452-4870-adb4-8050956ad12a/440fca68-0452-4870-adb4-8050956ad12a.jsonl";

const files = new Map();
const replaces = [];

for (const line of readFileSync(transcript, "utf8").split(/\n/).filter(Boolean)) {
  let o;
  try {
    o = JSON.parse(line);
  } catch {
    continue;
  }
  const content = o.message?.content;
  if (!Array.isArray(content)) continue;
  for (const c of content) {
    if (c.type !== "tool_use") continue;
    const p = c.input?.path?.replace(/\\/g, "/");
    if (!p?.includes("wira-kuliner")) continue;
    if (c.name === "Write" && typeof c.input?.contents === "string") {
      files.set(p, c.input.contents);
    }
    if (c.name === "StrReplace" && p && c.input?.old_string != null) {
      replaces.push({ path: p, old: c.input.old_string, neu: c.input.new_string ?? "" });
    }
  }
}

function writeFile(absPath, content) {
  const rel = absPath.replace(/^.*wira-kuliner\//i, "").replace(/^.*wira-kuliner\\/i, "");
  const out = join(root, rel.replace(/\//g, "\\"));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, content, "utf8");
  return out;
}

let written = 0;
for (const [p, contents] of files) {
  writeFile(p, contents);
  written++;
}

let patched = 0;
let skipped = 0;
for (const { path: p, old, neu } of replaces) {
  const rel = p.replace(/^.*wira-kuliner[/\\]/i, "");
  const out = join(root, rel);
  if (!existsSync(out)) {
    skipped++;
    continue;
  }
  let text = readFileSync(out, "utf8");
  if (!text.includes(old)) {
    skipped++;
    continue;
  }
  text = text.replace(old, neu);
  writeFileSync(out, text, "utf8");
  patched++;
}

console.log(`Restored ${written} files, applied ${patched} patches, skipped ${skipped} patches.`);
