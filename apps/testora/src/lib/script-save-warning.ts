import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { testFixtures } from "@/db/schema";
import { scriptSaveWarning } from "@/lib/seed-lint";

/**
 * The seed-lint warning (#714) for a scripted case saved through the UI/API:
 * looks up its fixture's metadata (destructive / waiver). Never blocks.
 */
export async function caseScriptWarning(testCase: {
  scriptType?: string | null;
  script?: string | null;
  fixtureId?: string | null;
}): Promise<string | null> {
  if (testCase.scriptType !== "scripted" || !testCase.script || !testCase.fixtureId) return null;
  // Best effort: the case is already saved, so a failed lookup mustn't turn
  // the response into an error.
  const fixture = await db.query.testFixtures
    .findFirst({ where: eq(testFixtures.fixtureId, testCase.fixtureId), columns: { metadata: true } })
    .catch(() => undefined);
  return scriptSaveWarning([testCase.script], fixture?.metadata);
}
