import { getDb, closeDb } from "./client";
import { seedDatabase } from "./seedDatabase";

// CLI entry point for `pnpm db:seed`. The actual work lives in
// seedDatabase() so it can be reused directly from integration tests.
async function main() {
  const result = await seedDatabase(getDb());
  console.log(`Seeded ${result.apps.length} app(s) across ${result.owners.length} owner(s).`);
  await closeDb();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
