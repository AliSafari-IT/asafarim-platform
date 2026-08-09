// Shared connection resolution for the CLI seed entry points.
//
// The seed-manager package resolves connections from an allowlisted table for
// the Admin Console. The CLI is different: it runs on a developer's machine
// or in a deploy step against whatever DATABASE_URL is in scope, so it keeps
// its own small resolver — including the docker-compose hostname rewrite the
// original scripts had.

import { existsSync } from "node:fs";

export function resolveCliDatabaseUrl(): string {
  const raw =
    process.env.DATABASE_URL ??
    "postgresql://asafarim:asafarim_dev@localhost:5432/asafarim";

  // Inside a container the compose service name resolves; on the host it does
  // not, but the port is published (see docker-compose.prod.yml).
  if (existsSync("/.dockerenv")) return raw;

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
