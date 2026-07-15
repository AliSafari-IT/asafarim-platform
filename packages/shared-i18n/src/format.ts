/**
 * Interpolate `{name}` placeholders in a translation string.
 *
 *   format("Hello {name}", { name: "Ali" }) → "Hello Ali"
 */
export function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    key in vars ? String(vars[key]) : `{${key}}`
  );
}
