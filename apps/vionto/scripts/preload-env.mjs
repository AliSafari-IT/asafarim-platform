/**
 * Node.js preload script (--import flag).
 * Runs before any module — including Prisma — so process.env is patched
 * from .env files before DATABASE_URL / DO_SPACES_SECRET are ever read.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const candidates = [
  resolve(__dir, "..", ".env"),                   // apps/vionto/.env      (highest priority)
  resolve(__dir, "..", "..", "..", ".env.local"), // repo root .env.local  (platform convention)
  resolve(__dir, "..", "..", "..", ".env"),       // repo root .env        (fallback)
];

const seen = new Set();
for (const envPath of candidates) {
  if (!existsSync(envPath)) continue;
  for (const line of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    if (seen.has(key)) continue; // first (higher-priority) file already set it
    seen.add(key);
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}
