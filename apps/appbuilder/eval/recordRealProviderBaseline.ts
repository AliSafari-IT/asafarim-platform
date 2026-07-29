import { OpenAiProvider, loadAiProviderConfig, AiProviderConfigError } from "@asafarim/appbuilder-ai";
import { getTestDb, migrateTestDb, resetTestDb, closeTestDb } from "../lib/db/testUtils";
import { runEvaluationWithProvider } from "./runEvaluation";

/**
 * Manual, optional real-provider run of the M13 slice A regression corpus
 * (docs/appbuilder-m13-multimodal-contextual-assistant.md's "Real-provider
 * semantic evaluation is a release gate, not deterministic per-commit CI").
 * Requires APPBUILDER_AI_OPENAI_API_KEY or OPENAI_API_KEY, and a reachable
 * appbuilder-postgres test database. Never wired into `pnpm test` /
 * `pnpm test:integration`.
 *
 *   pnpm --filter @asafarim/appbuilder eval:m13:real
 */
async function main() {
  let config;
  try {
    config = loadAiProviderConfig({ ...process.env, APPBUILDER_AI_PROVIDER: "openai" });
  } catch (err) {
    if (err instanceof AiProviderConfigError) {
      console.error(`Cannot run a real-provider evaluation: ${err.message}`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  const db = getTestDb();
  await migrateTestDb();
  await resetTestDb();
  try {
    const provider = new OpenAiProvider(config);
    const report = await runEvaluationWithProvider(db, provider);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await closeTestDb();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
