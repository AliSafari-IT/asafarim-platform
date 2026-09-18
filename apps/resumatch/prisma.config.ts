import { defineConfig } from "prisma/config";

declare const process: {
  env: {
    RESUMATCH_DATABASE_URL?: string;
    RESUMATCH_SHADOW_DATABASE_URL?: string;
  };
};

// Local default matches docker-compose.yml's resumatch-postgres service.
// Staging and production supply RESUMATCH_DATABASE_URL explicitly; there is
// no shared-platform fallback on purpose, so a misconfigured environment
// fails loudly instead of quietly migrating the wrong database.
const shadowDatabaseUrl =
  process.env.RESUMATCH_SHADOW_DATABASE_URL ??
  "postgresql://resumatch:resumatch_dev@localhost:55437/resumatch_shadow";

const databaseUrl =
  process.env.RESUMATCH_DATABASE_URL ??
  "postgresql://resumatch:resumatch_dev@localhost:55437/resumatch";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
    // Only used by `prisma migrate diff --from-migrations` (the CI
    // drift check) and by `migrate dev`'s shadow database. Never the
    // target of an application connection.
    shadowDatabaseUrl,
  },
});
