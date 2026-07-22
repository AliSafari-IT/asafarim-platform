# @asafarim/appbuilder-runtime

Approved component/template registry and metadata-driven preview renderer
for AppBuilder generated apps — M06 of the delivery series tracked in
[issue #29](https://github.com/AliSafari-IT/asafarim-platform/issues/29).

See [docs/appbuilder-runtime.md](../../docs/appbuilder-runtime.md) for the
full architecture, security model, preview lifecycle, and testing
documentation. Short version:

- No database, auth/session, AI provider, Next.js, or deployment dependency
  — only React, `@asafarim/ui`, `@asafarim/appbuilder-schema`, and `zod`.
- `renderPreview({ specification, path, basePath })` is the only rendering
  entry point: a parsed `ApplicationSpecificationType` in, a React element
  or structured `RenderError[]` out. Never executes generated code; never
  falls back to an approximation of an unregistered component.
- The registry is keyed by `{schemaKind}.{variant}` (not schema `kind`
  alone), since `@asafarim/appbuilder-schema`'s `COMPONENT_KINDS` is a
  frozen validation allowlist and extending the *rendered* catalog should
  never require a schema-version bump.

```ts
import { renderPreview, listRegistryEntries, listTemplates } from "@asafarim/appbuilder-runtime";

const result = renderPreview({
  specification, // ApplicationSpecificationType — already validated by the caller
  path: [],       // [] = homepage; ["projects"] = /preview/projects
  basePath: "/apps/app_123/preview",
});

if (result.ok) {
  // result.element is a ReactElement; result.warnings are already rendered inline
} else {
  // result.errors: structured, safe-to-display RenderError[]
}
```

## Scripts

```bash
pnpm --filter @asafarim/appbuilder-runtime build       # tsc -p tsconfig.build.json
pnpm --filter @asafarim/appbuilder-runtime typecheck
pnpm --filter @asafarim/appbuilder-runtime test         # vitest, 71 tests, no DB/browser needed
```
