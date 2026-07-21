import { seedDatabase } from "@/db/seedDatabase";

// CLI entry point for `pnpm db:seed`. The actual work lives in seedDatabase()
// so the Run page's "Update tests" API route can reuse it without this script's
// process.exit side effects.
async function main() {
  const result = await seedDatabase();
  for (const item of result.perRequirement) {
    console.log(
      `Seeded "${item.title}" (${item.suites} suite(s), ${item.fixtures} fixture(s), ${item.cases} case(s)).`,
    );
  }
  console.log(
    `Done — ${result.requirements} requirement(s), ${result.suites} suite(s), ${result.fixtures} fixture(s), ${result.cases} case(s).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
