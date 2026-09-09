/**
 * Local-dev env loader, imported as the very first line of worker.ts (a
 * side-effect import) so `process.env` is patched from `.env`/`.env.local`
 * files before any lazily-read var (APPBUILDER_DATABASE_URL, REDIS_URL,
 * OPENAI_API_KEY, ...) is ever accessed. A plain importable module rather
 * than a Node `--import` CLI flag deliberately — `--import ./scripts/...`
 * is fragile cross-shell on Windows (cmd.exe backslash-mangles the "./"
 * relative specifier Node's ESM resolver requires), and since nothing in
 * this codebase reads `process.env` at module-import time (the established
 * lazy-read convention), a plain early import achieves the identical
 * ordering guarantee without that fragility. In production, `.env*` files
 * don't exist in the container and every var already comes from
 * docker-compose — this is then a harmless no-op (see `existsSync` guards
 * below), never required. Mirrors apps/vionto/scripts/preload-env.mjs's
 * logic and priority order.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// __dirname (not import.meta.url) deliberately — this module is bundled to
// CJS (tsup.worker.config.ts), where __dirname is natively available and
// import.meta.url is not. Bundling flattens everything into
// apps/appbuilder/worker-dist/worker.js, so __dirname at runtime is always
// that worker-dist directory, not this file's original source location —
// paths below are relative to THAT, not to lib/server/.
const candidates = [
  resolve(__dirname, "..", ".env.local"), // apps/appbuilder/.env.local (highest priority)
  resolve(__dirname, "..", ".env"),
  resolve(__dirname, "..", "..", "..", ".env.local"), // repo root .env.local (platform convention)
  resolve(__dirname, "..", "..", "..", ".env"), // repo root .env (fallback)
];

const seen = new Set<string>();
for (const envPath of candidates) {
  if (!existsSync(envPath)) continue;
  for (const line of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    if (seen.has(key)) continue; // first (higher-priority) file already set it
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    // An empty value is a placeholder (e.g. root .env copied from
    // .env.example) — skip it entirely so a real value from a lower-priority
    // file can still fill the var, and so strict validators downstream never
    // see `KEY=` as a set-but-invalid value.
    if (val === "") continue;
    seen.add(key);
    process.env[key] = val;
  }
}
