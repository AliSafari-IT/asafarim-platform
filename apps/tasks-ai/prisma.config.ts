import { defineConfig } from "prisma/config";

declare const process: {
  env: {
    TASKSAI_DATABASE_URL?: string;
    TASKSAI_SHADOW_DATABASE_URL?: string;
  };
};

// Local default matches docker-compose.yml's tasksai-postgres service
// (host port 55438). Staging and production supply TASKSAI_DATABASE_URL
// explicitly; there is deliberately no shared-platform fallback, so a
// misconfigured environment fails loudly instead of quietly migrating the
// wrong database. See apps/tasks-ai/docs/adr/0001-dedicated-database.md.
const shadowDatabaseUrl =
  process.env.TASKSAI_SHADOW_DATABASE_URL ??
  "postgresql://tasksai:tasksai_dev@127.0.0.1:55438/tasksai_shadow";

const databaseUrl =
  process.env.TASKSAI_DATABASE_URL ??
  "postgresql://tasksai:tasksai_dev@127.0.0.1:55438/tasksai";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
    shadowDatabaseUrl,
  },
});
