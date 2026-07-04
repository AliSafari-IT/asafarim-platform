import { defineConfig } from "prisma/config";

declare const process: {
  env: {
    DATABASE_URL?: string;
  };
};

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://asafarim:asafarim_dev@localhost:5432/asafarim";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
