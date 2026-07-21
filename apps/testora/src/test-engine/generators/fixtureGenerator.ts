import type { TestFixtureDefinition } from "@/test-engine/types";

export function generateFixtureScript(fixture: TestFixtureDefinition): string {
  const lines: string[] = [];
  lines.push(`fixture\`${fixture.title}\``);
  if (fixture.baseUrl) {
    lines.push(`  .page(\`${fixture.baseUrl}\`)`);
  }
  // Some targets (esp. external production SSR apps) throw benign client-side
  // errors — e.g. React hydration warnings — that TestCafe would otherwise treat
  // as test failures. `metadata.skipJsErrors` opts a fixture out: `true` ignores
  // all JS errors, a string ignores only errors whose message matches it.
  const skip = fixture.metadata?.skipJsErrors;
  if (typeof skip === "string") {
    lines.push(`  .skipJsErrors({ message: new RegExp(${JSON.stringify(skip)}) })`);
  } else if (skip === true) {
    lines.push(`  .skipJsErrors()`);
  }
  if (fixture.setupScript) {
    lines.push(`  .beforeEach(async t => {`);
    lines.push(`    ${fixture.setupScript}`);
    lines.push(`  })`);
  }
  if (fixture.teardownScript) {
    lines.push(`  .afterEach(async t => {`);
    lines.push(`    ${fixture.teardownScript}`);
    lines.push(`  })`);
  }
  return `${lines.join("\n")};`;
}
