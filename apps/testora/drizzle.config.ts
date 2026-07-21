import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.TESTORA_DATABASE_URL ?? "postgres://e2e_testora:e2e_testora@localhost:55434/e2e-testing-db",
  },
});
