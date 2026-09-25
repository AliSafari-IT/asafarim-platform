import path from "node:path";
import { config as loadEnv } from "dotenv";

// The CLI runs outside Next.js, so nothing loads env files for it. Mirror
// next.config.ts: the shared monorepo-root env first, then the app-local
// .env.local for testora-specific values (e.g. ASAFARIM_ADMIN_EMAIL). Must be
// imported before any module that reads process.env at import time.
const appDir = path.resolve(import.meta.dirname, "../..");
loadEnv({ path: path.join(appDir, "../../.env.local"), quiet: true });
loadEnv({ path: path.join(appDir, "../../.env"), quiet: true });
loadEnv({ path: path.join(appDir, ".env.local"), quiet: true });
