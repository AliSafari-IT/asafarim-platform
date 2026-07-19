// Runs `prisma migrate deploy` with a production-aware DATABASE_URL.
// When the URL points at the docker-compose service name ("postgres") but the
// script runs on the host (not inside a container), that hostname does not
// resolve — rewrite it to localhost (the port is published on 127.0.0.1 in
// docker-compose.prod.yml). Mirrors the logic in prisma/seed.ts.

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

function resolveDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return raw;

  const insideContainer = existsSync("/.dockerenv");
  if (insideContainer) return raw;

  try {
    const url = new URL(raw);
    if (url.hostname === "postgres") {
      url.hostname = "localhost";
      console.log(
        "DATABASE_URL host 'postgres' is not resolvable outside Docker — using localhost instead."
      );
      return url.toString();
    }
  } catch {
    // Fall through with the raw value; Prisma will report a clearer error.
  }
  return raw;
}

const databaseUrl = resolveDatabaseUrl();

const result = spawnSync("prisma", ["migrate", "deploy"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}) },
});

process.exit(result.status ?? 1);
