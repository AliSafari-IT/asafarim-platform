import { Selector } from "testcafe";

/**
 * Generic scenario executor used by generated TestCafe specs. It performs a
 * best-effort form fill + submit based on the input keys, then asserts any
 * expected.errorMessage / expected.redirectTo against the page. Replace or
 * extend this with app-specific selectors as the platform is wired to a real
 * target application.
 *
 * Plain JS (not TS): TestCafe's own compiler only transpiles the spec file
 * it is given, not arbitrary modules that file imports, so this helper must
 * already be valid JavaScript.
 */
// Values of the form "{{ENV_VAR_NAME}}" are resolved from process.env at run
// time, so secrets (passwords, tokens) never need to be stored in test case
// data itself — only a placeholder is persisted.
function resolveValue(value) {
  const match = /^\{\{(\w+)\}\}$/.exec(value);
  if (!match) return value;
  const resolved = process.env[match[1]];
  if (resolved === undefined) {
    throw new Error(`Missing environment variable "${match[1]}" referenced by test data.`);
  }
  return resolved;
}

export async function runScenario(t, data, expected) {
  for (const [field, rawValue] of Object.entries(data)) {
    if (typeof rawValue !== "string" && typeof rawValue !== "number") continue;
    const value = typeof rawValue === "string" ? resolveValue(rawValue) : rawValue;
    const input = Selector(`[name="${field}"], #${field}`);
    if (await input.exists) {
      const stringValue = String(value);
      if (stringValue) {
        await t.typeText(input, stringValue, { replace: true });
      } else {
        await t.selectText(input).pressKey("delete");
      }
    }
  }

  const submitButton = Selector('button[type="submit"], [data-testid="submit"]');
  if (await submitButton.exists) {
    await t.click(submitButton);
  }

  if (typeof expected.errorMessage === "string") {
    const errorEl = Selector('[role="alert"], .error, [data-testid="error"]');
    await t.expect(errorEl.exists).ok("Expected an error message to be displayed");
    await t.expect(errorEl.innerText).contains(expected.errorMessage);
  }

  if (typeof expected.redirectTo === "string") {
    await t.expect(t.eval(() => window.location.pathname)).eql(expected.redirectTo);
  }
}
