import type { TestCaseDefinition, TestFixtureDefinition } from "@/test-engine/types";

/**
 * Seed lint (#701): a scripted case (or fixture setup/teardown) that creates
 * an account or sends a non-GET request writes data on whatever deployment
 * the run targets. Its fixture must be tagged `destructive: true` — so the
 * run route skips it on web targets — or carry an explicit, reviewed waiver
 * `mutatesRemote: "reviewed"` (the write is known to be safe on production).
 *
 * Static and heuristic: it catches the patterns the seeds use (Hub sign-up,
 * `t.request` / `fetch` with a write method). A UI flow that submits a form by
 * clicking can't be detected — tag those fixtures by hand.
 */

const MUTATION_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "account sign-up", pattern: /\/sign-?up\b/i },
  { label: "account registration", pattern: /\/register\b|\bcreateAccount\s*\(/i },
  { label: "write request (method: POST/PUT/PATCH/DELETE)", pattern: /\bmethod\s*:\s*['"`](POST|PUT|PATCH|DELETE)['"`]/i },
  { label: "write request (t.request.post/put/patch/delete)", pattern: /\bt\.request\.(post|put|patch|delete)\s*\(/i },
];

export interface UnguardedMutation {
  fixtureId: string;
  /** The case, or "setupScript"/"teardownScript" for fixture-level scripts. */
  source: string;
  reasons: string[];
}

/** What a script does that writes data, by the patterns above. */
export function mutationReasons(script: string | undefined): string[] {
  if (!script) return [];
  return MUTATION_PATTERNS.filter(({ pattern }) => pattern.test(script)).map(({ label }) => label);
}

/** Whether a fixture is allowed to contain writing scripts. */
export function isMutationGuarded(fixture: TestFixtureDefinition | undefined): boolean {
  const metadata = fixture?.metadata ?? {};
  return metadata.destructive === true || metadata.mutatesRemote === "reviewed";
}

/** Every writing script whose fixture is neither destructive nor waived. */
export function findUnguardedMutations(bundles: {
  fixtures: TestFixtureDefinition[];
  cases: TestCaseDefinition[];
}[]): UnguardedMutation[] {
  const found: UnguardedMutation[] = [];
  for (const bundle of bundles) {
    const fixtures = new Map(bundle.fixtures.map((f) => [f.fixtureId, f]));
    for (const fixture of bundle.fixtures) {
      for (const source of ["setupScript", "teardownScript"] as const) {
        const reasons = mutationReasons(fixture[source]);
        if (reasons.length > 0 && !isMutationGuarded(fixture)) {
          found.push({ fixtureId: fixture.fixtureId, source, reasons });
        }
      }
    }
    for (const testCase of bundle.cases) {
      if (testCase.scriptType !== "scripted") continue;
      const reasons = mutationReasons(testCase.script);
      if (reasons.length > 0 && !isMutationGuarded(fixtures.get(testCase.fixtureId))) {
        found.push({ fixtureId: testCase.fixtureId, source: testCase.caseId, reasons });
      }
    }
  }
  return found;
}
