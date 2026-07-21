import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.APPBUILDER_DATABASE_URL ??
      "postgres://appbuilder:appbuilder_dev@localhost:55436/appbuilder",
  },
});
