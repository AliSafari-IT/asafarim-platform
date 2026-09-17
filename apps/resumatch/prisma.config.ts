import { defineConfig } from "prisma/config";

declare const process: {
  env: {
    JOBMATCH_DATABASE_URL?: string;
    JOBMATCH_SHADOW_DATABASE_URL?: string;
  };
};

// Local default matches docker-compose.yml's jobmatch-postgres service.
// Staging and production supply JOBMATCH_DATABASE_URL explicitly; there is
// no shared-platform fallback on purpose, so a misconfigured environment
// fails loudly instead of quietly migrating the wrong database.
const shadowDatabaseUrl =
  process.env.JOBMATCH_SHADOW_DATABASE_URL ??
  "postgresql://jobmatch:jobmatch_dev@localhost:55437/jobmatch_shadow";

const databaseUrl =
  process.env.JOBMATCH_DATABASE_URL ??
  "postgresql://jobmatch:jobmatch_dev@localhost:55437/jobmatch";

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
