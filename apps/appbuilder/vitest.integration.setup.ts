import { config } from "dotenv";
import { resolve } from "node:path";

/**
 * The integration suite needs APPBUILDER_TEST_DATABASE_URL (see
 * lib/db/testDbGuard.ts) and provider keys, none of which vitest loads on
 * its own. `.env.local` first so it wins ties (dotenv's `config()` never
 * overwrites an already-set var), then `.env` for anything still missing.
 */
config({ path: resolve(__dirname, ".env.local") });
config({ path: resolve(__dirname, ".env") });
