// Types for the plain-JS scenario runner (see scenarioRunner.js for why it is JS).
export function resolveValue(value: string, env: Record<string, string> | undefined): string;
export function runScenario(
  t: unknown,
  data: Record<string, unknown>,
  expected: Record<string, unknown>,
  env?: Record<string, string>,
): Promise<void>;
