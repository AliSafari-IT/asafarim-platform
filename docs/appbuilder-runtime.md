# AppBuilder Metadata-Driven Preview Runtime (M06)

**Package:** `packages/appbuilder-runtime` (`@asafarim/appbuilder-runtime`)
**Consumer:** `apps/appbuilder`
**Document date:** 2026-07-22
**Scope:** M06 of the delivery series tracked in
[issue #29](https://github.com/AliSafari-IT/asafarim-platform/issues/29) —
see [issue #35](https://github.com/AliSafari-IT/asafarim-platform/issues/35)
for the milestone's acceptance criteria. Builds on M02's persistence, M03's
authorization, M04's `@asafarim/appbuilder-schema` contract
([README](../packages/appbuilder-schema/README.md)), and M05's catalog/
creation flow ([docs/appbuilder-architecture.md](appbuilder-architecture.md)).

## Summary

M06 renders a generated application from its validated, immutable
specification, using only an approved registry of React components — never
generated JavaScript, HTML, CSS, or SQL, and never a dynamically imported
package. The core architectural rule, unchanged from
[ADR 0001](adr/0001-appbuilder-managed-runtime.md):

> A generated application is rendered from a validated, immutable application
> specification using only approved runtime components.

`@asafarim/appbuilder-runtime` owns the registry and the renderer. It has
zero dependency on AppBuilder's database, auth/session code, AI providers,
Next.js, or deployment infrastructure — it accepts a specification object and
returns React elements or structured errors, nothing else. `apps/appbuilder`
owns database access, authorization, and version/checksum resolution, and
passes only an already-authorized, validated, immutable specification into
the runtime.

## Package boundary

```
packages/appbuilder-runtime/
  src/
    version.ts            REGISTRY_VERSION
    security/
      url.ts               sanitizeUrl() — protocol allowlist
      branding.ts           resolveBranding() — accent/radius/logo allowlist
    registry/
      types.ts              RegistryEntry, CatalogEntryMeta, ComponentRenderProps
      limits.ts              RENDER_LIMITS (defense-in-depth ceilings)
      configSchemas.ts        one strict Zod schema per registry entry
      registry.ts             the approved registry + resolveComponentEntry()
      components/            React renderers (one file per family)
    render/
      types.ts               RenderError
      resolvePage.ts          resolveHomePage, resolvePageByPath, buildNavItems
      demoData.ts             deterministic preview/demo row generation
      renderPreview.tsx       the single renderer entry point
    templates/
      types.ts                AppTemplate
      blank.ts, taskManagement.ts, crm.ts, inventory.ts, booking.ts
      registry.ts              listTemplates(), getTemplate()
    styles/
      preview.css              generated-app chrome + registry primitive styles
```

Allowed dependencies: React, `@asafarim/ui`, `@asafarim/appbuilder-schema`,
`zod`. No database client, no auth/session import, no AI SDK, no
`next/*` import, no deployment tooling — verified by this package having no
such dependency in `package.json` and no such import anywhere in `src/`.

## Registry architecture

### Why composite keys, not a 1:1 kind mapping

`@asafarim/appbuilder-schema`'s `COMPONENT_KINDS` (`dataTable`, `form`,
`detailView`, `statWidget`, `chartWidget`, `buttonAction`) is a **frozen
validation allowlist** — extending it is a schema-version-bumping change
(see the schema package's own README), and bumping `SPEC_SCHEMA_VERSION`
would break every already-persisted `specification_versions.payload`, whose
`schemaVersion` field is a Zod literal checked on every parse. M06 needs more
rendering primitives than there are schema kinds, so the registry is keyed by
**`{schemaKind}.{variant}`**, where `variant` comes from the specification's
own `config.variant` string (a plain, already-content-safety-scanned config
value — see the schema package's `ComponentConfigValue`). Multiple registry
entries share one schema `kind`:

| Registry `typeId` | schema `kind` | `variant` |
| --- | --- | --- |
| `dataTable` | `dataTable` | `table` (default) |
| `kanbanBoard` | `dataTable` | `kanban` |
| `calendarView` | `dataTable` | `calendar` |
| `form` | `form` | `form` (default) |
| `filters` | `form` | `filters` |
| `settingsPanel` | `form` | `settingsPanel` |
| `detailView` | `detailView` | `detail` (default) |
| `activityTimeline` | `detailView` | `activityTimeline` |
| `fileField` | `detailView` | `fileField` |
| `emptyState` | `detailView` | `emptyState` |
| `statWidget` | `statWidget` | `default` |
| `chartWidget` | `chartWidget` | `default` |
| `buttonAction` | `buttonAction` | `default` |

Three additional **chrome** primitives (`chrome.shell`, `chrome.navigation`,
`chrome.pageHeader` — `registry/components/chrome.tsx`'s `CHROME_CATALOG`)
aren't page components at all: the renderer invokes them exactly once per
render, driven by the whole specification (branding, navigation, the
resolved page's name), not by an entry in `page.components[]`.

`registry/registry.ts#resolveComponentEntry(component)` is the only lookup
path: it reads `component.kind` and `component.config.variant` (defaulting
per-kind — `dataTable→table`, `form→form`, `detailView→detail`, everything
else → `default`) and returns the matching `RegistryEntry`, or `undefined`.
The renderer distinguishes an **unknown kind** (not one of the six schema
kinds at all — should be unreachable if `validateSpecification` already ran,
but checked anyway) from an **unknown variant** (a valid kind, no matching
registry entry) for a more actionable diagnostic.

### Registry entry contract

Every entry (`registry/types.ts#RegistryEntry`) declares:

- `typeId` — stable, never reused for a different renderer once shipped.
- `displayName`, `category`, `version` (this entry's own version).
- `schemaKind` / `variant` — the composite lookup key.
- `configSchema` — a `.strict()` Zod schema (`registry/configSchemas.ts`):
  unknown keys are a validation failure, not silently dropped.
- `dataBinding` — `"none" | "singleEntity" | "entityList"`.
- `supportedActions` — which `ACTION_KINDS` this component can surface as a
  preview-only affordance.
- `responsiveNotes`, `emptyStateDescription`, `loadingStateDescription`,
  `errorStateDescription`, `a11yNotes` — plain-text documentation fields,
  not just code comments, so the registry is self-describing.
- `deprecated?: { since, migrateTo, note }` — set on an entry to mark it
  superseded without removing it (removing a `typeId` outright would break
  any existing specification referencing it via `kind`/`variant`).
- `render(props)` — the React renderer. `props` never includes anything the
  component could use to escape the sandbox: no raw HTML string prop, no
  arbitrary URL without going through `sanitizeUrl` first, no callback into
  application code.

### Data binding — M09's boundary

M09 (generated-record CRUD) hasn't shipped. Every data-dependent registry
entry either renders a safe, labelled empty state or **deterministic,
clearly-labelled preview/demo data** (`render/demoData.ts#generateDemoRows` —
seeded from the entity id, never `Math.random()`/`Date.now()`, so a preview
render is reproducible and testable) wrapped in a visible `DemoDataNotice`
(`registry/components/states.tsx`) badge. Nothing here ever implies a
generated record has been persisted. Forms and filters render every field as
`disabled` with a hint pointing at M09 — not because disabling is a security
control (React never executes a disabled input either way), but so a
reviewer never mistakes the preview for functional CRUD.

### Templates

`templates/registry.ts` lists five templates, one id per
`apps/appbuilder`'s `StarterFamily` enum (`lib/validation/createApp.ts`):
`blank`, `task_management`, `crm`, `inventory`, `booking`. Each `build(app)`
is a pure function — same input always produces the same
`ApplicationSpecificationType`, verified in `templates/registry.test.ts`
(`validateSpecification` passes, determinism, and — for every non-`blank`
template — that its homepage renders through `renderPreview` with zero
warnings). `blank.build` is `emptySpecification` itself, byte-for-byte — the
existing M05 creation transaction (`lib/repositories/apps.ts#createApp`)
already persists exactly that for every new app regardless of chosen
starter family, and this package's `blank` template is required to match it
exactly so no M05 test or existing app's version-1 payload is invalidated.

**M06 does not wire template selection into app creation.** `createApp`
still always persists `emptySpecification()` — templates exist here as a
tested, reusable registry, ready for a future milestone (or a follow-up) to
apply based on the `creation_requests.starterFamily` already recorded by
M05. Wiring that in now would touch M05's already-shipped, heavily-tested
creation transaction for a change outside M06's stated scope (the runtime
and registry, not the creation flow) — a deliberate, explicit deferral, not
an oversight.

`task_management`'s template (and, for the visual/E2E proof below, the
existing **M04 `constructionTaskManagementFixture`**,
`@asafarim/appbuilder-schema/fixtures`) exercise the fullest primitive set:
dashboard metric cards + chart, a projects table + form, a tasks table +
record detail, a Kanban board, a calendar/schedule view, a team table
(role-gated in the spec's own navigation), and a settings panel.

## The renderer (`render/renderPreview.tsx`)

```ts
renderPreview({ specification, path, basePath }): PreviewRenderResult
```

Deterministic, synchronous, side-effect-free:

1. **`validateSpecification(specification)`** — the schema package's full
   semantic validator (duplicate/orphaned references, RBAC/permission
   sanity, workflow-cycle detection, content-safety scan). Any failure is a
   top-level `{ ok: false, errors }` — `malformed_specification` — never a
   partial render. Called unconditionally, even though `apps/appbuilder`
   only ever hands the renderer a specification from an *already-succeeded*
   preview build — a pure function should never trust its caller's
   bookkeeping over its own input.
2. **Resolve the page.** `path: []` (the base `/apps/{appId}/preview`
   route) resolves the **homepage**: the page targeted by the
   lowest-`order` navigation item that still points at a real, non-archived
   page, falling back to the first non-archived page if navigation is empty
   or entirely dangling (`render/resolvePage.ts#resolveHomePage`). A
   non-empty `path` resolves by exact `page.path` match. Two special cases:
   - **Zero pages in the whole specification, path `[]`** — a brand-new/
     blank app — renders a safe "No pages configured yet" success state,
     not a failure (an empty app isn't broken).
   - Any other unresolvable path (including a non-empty path on a
     zero-page app) is `unknown_page` — the caller renders this as the
     generated-app's own 404, never a builder error.
3. **Render each item.** The top-level `dashboard.widgets` collection
   (schema-level, not tied to any page id) renders first, but *only* on the
   homepage, ahead of that page's own `components[]` — both lists share one
   `order`-sorted render pass. For each item: resolve its registry entry
   (fail closed with `unknown_component_kind`/`unknown_variant` — an inline
   diagnostic card, not a blank space, and the rest of the page still
   renders); strictly parse its `config` (fail closed with
   `invalid_config` on the first unrecognized/invalid key); resolve its
   bound entity if any (`invalid_binding` warning, not a page-level
   failure, if the reference is stale); call `render()` inside a `try/catch`
   (`invalid_config` on an unexpected renderer exception, never an
   unhandled crash).
4. **Bounded, always.** `RENDER_LIMITS.MAX_COMPONENTS_PER_PAGE` (100,
   matching the schema package's own `LIMITS.MAX_COMPONENTS_PER_PAGE`) is
   re-checked here — defense-in-depth against a specification that reached
   the renderer without having gone through the schema's own array-length
   cap. Components are a flat, non-recursive list (no `children` field
   exists on `ComponentConfig`), so a component-tree cycle is structurally
   impossible; workflow-step cycles are caught by `validateSpecification`
   in step 1.
5. **Return.** `{ ok: true, pageId, pageName, element, warnings }` — every
   `warnings[]` entry is already rendered inline as a visible diagnostic;
   the array is also returned structured, for logging/tests. Or
   `{ ok: false, errors }` for a top-level failure.

The renderer never mutates `specification` and never reads a version id,
checksum, or anything else from its `path`/`basePath` inputs — those are
opaque strings the caller (the Next.js route) already resolved from its own
authorized, pinned lookup.

## Security model

- **No code execution, ever.** No `eval`, `Function`, VM sandbox, dynamic
  `import()` of a specification-supplied path, or `dangerouslySetInnerHTML`
  anywhere in this package (verified by the unit tests below and by
  inspection — grep the package for any of these before extending it).
  Every specification-supplied string (names, descriptions, branding,
  config labels) renders as a plain React child — text nodes, escaped by
  React itself, never concatenated into markup.
- **URL allowlist** (`security/url.ts#sanitizeUrl`): only `https:`/`http:`
  absolute URLs and same-origin relative paths pass through to a real
  `href`/`src`; `javascript:`, `data:text/html`, `vbscript:`, `file:`, and
  protocol-relative (`//`) URLs are rejected outright. Image references
  (branding logo) additionally accept `data:image/{png,jpeg,gif,webp,
  svg+xml}` — never `data:text/html`.
- **Branding allowlist** (`security/branding.ts#resolveBranding`): a
  specification's `branding.primaryColor` maps onto one of six named safe
  accents (`SAFE_ACCENT_CHOICES`), defaulting to `violet` for anything
  unrecognized — an arbitrary hex/CSS value never reaches a `style`
  attribute or class name. `radius`/`density` are similarly closed enums.
  `companyName` is a plain string (rendered as text, not HTML); `logoUrl`
  goes through `sanitizeUrl`.
- **Strict, unknown-key-rejecting config schemas** — see "Registry entry
  contract" above. A specification cannot smuggle an unrecognized key
  through a registry entry's config and have it silently ignored; parsing
  fails, and the renderer shows a diagnostic instead of guessing.
- **Bounded rendering** — `RENDER_LIMITS` (`registry/limits.ts`): component
  count per page, table rows/columns, Kanban columns/cards-per-column,
  timeline items, form fields, chart series points — all capped
  independently of (and at or below) the schema package's own `LIMITS`.
- **Content-Security-Policy** (`apps/appbuilder/proxy.ts`) — the preview
  route gets a strict, per-request-nonce CSP:
  `script-src 'self' 'nonce-<random>' 'strict-dynamic'`, `object-src
  'none'`, `frame-ancestors 'self'` (same-origin only — allows the future
  M08 builder workspace to embed this route, blocks every other origin —
  plus a static `X-Frame-Options: SAMEORIGIN` fallback in
  `next.config.ts`). The nonce is generated fresh per request and injected
  into both the request headers (so Next.js's own RSC-hydration inline
  scripts pick it up automatically — see
  [Next's CSP guide](https://nextjs.org/docs/app/guides/content-security-policy))
  and the response header. This CSP is layered on top of, not a
  replacement for, `@asafarim/auth`'s shared session-check proxy — see the
  comment in `proxy.ts` for why it's implemented in `apps/appbuilder` rather
  than the shared `@asafarim/auth` package.
- **No cross-app/cross-owner leakage** — see "Preview lifecycle" below;
  this is enforced entirely in `apps/appbuilder`, not the runtime package
  (which never sees an app id, owner, or database).

## Preview lifecycle (`apps/appbuilder/lib/repositories/previewService.ts`)

Builds on the M05 `preview_builds` table/repository
(`lib/repositories/previewBuilds.ts`) with M06 additions (migration
`0003_appbuilder_m06_preview_runtime.sql`):

- `preview_builds.checksum`, `preview_builds.registry_version` — pin a build
  to the exact `(specificationVersionId, checksum, registryVersion)` triple
  that produced it. `preview_builds_version_registry_unique` (unique index
  on `(specification_version_id, registry_version)`) makes a repeated
  request for the same version + registry version **idempotent**: reuse the
  existing row instead of inserting a duplicate.
- `preview_builds.diagnostics` (`jsonb`) — structured `RenderError[]`/
  validation-issue objects, never a raw stack trace or database detail.
- `specifications.pinned_preview_build_id` — the **only** pointer
  `/apps/{appId}/preview` ever reads. Set **only** inside
  `requestPreviewBuild` after a build's status is computed as `succeeded`;
  a failed build never touches it, so the last successful preview keeps
  serving. There is no code path that points it at anything else.

`requestPreviewBuild(db, actor, appId)`:

1. `assertCapability(..., "app.editSpecification")` — same minimum as the
   M05 `createPreviewBuild` primitive; blocked on an archived app
   (`ConflictError`).
2. Loads the app's *current* specification version.
3. If an identical `(specificationVersionId, registryVersion)` build already
   exists, reuses it (and re-pins if it was `succeeded` and isn't already
   pinned) — idempotent, no duplicate row, no re-validation.
4. Otherwise: recomputes the version's checksum and compares it to the
   stored one (`checksum_mismatch` — corruption, not a normal validation
   failure, fails the build outright); if it matches, runs
   `validateSpecification` and then `renderPreview({ path: [] , ...})`
   (a **synchronous** homepage-only check — no M07-style background job
   system; see "Explicit non-goals" below) — any failure at either stage
   populates `diagnostics` and marks the build `failed`, *without* touching
   the pinned pointer.
5. Inserts the build row and, only on success, updates the pinned pointer,
   inside one transaction; writes a `preview.build.succeeded` or
   `preview.build.failed` audit event either way.

`getPinnedPreview(db, actor, appId)`:

1. `assertCapability(..., "app.viewPreview")` — a viewer-level capability,
   deliberately allowed while an app is archived (M03's
   `ALLOWED_WHILE_ARCHIVED`) — see "Archived-app policy" below.
2. Reads `specifications.pinned_preview_build_id`; returns `null` if unset
   or the pinned build isn't `succeeded` (defensive — should be
   unreachable given step 4 above, but never trusted blindly).
3. Loads that build's `specificationVersions` row and returns
   `{ build, specificationPayload }`.

Neither function accepts or consults a version/build id from the caller —
the pinned pointer, resolved server-side from the actor-scoped app row, is
the sole source of truth.

## Preview route (`/apps/[appId]/preview/[[...path]]`)

`apps/appbuilder/app/apps/[appId]/preview/[[...path]]/page.tsx` — an
optional Next.js catch-all (`path` is `undefined` for the base route, a
segment array for internal navigation):

```
https://appbuilder.asafarim.com/apps/{app-id}/preview            → homepage
https://appbuilder.asafarim.com/apps/{app-id}/preview/projects    → "projects" page
http://localhost:3006/apps/{app-id}/preview                       (local)
```

1. `requireActor()` — redirects a signed-out request to Hub's centralized
   sign-in with an **absolute** callback URL back to this exact preview
   path (fixed in this milestone — `lib/auth/session.ts#requireActor`
   previously passed a relative path, which Hub's own sign-in page resolves
   relative to *its own* origin, not AppBuilder's; every `requireActor`
   call site benefits from this fix, not just the preview route).
2. `getPinnedPreview` — `NotFoundError` (unrelated actor or a genuinely
   nonexistent app) maps to Next's `notFound()`, identical to M03's
   existing leak-prevention pattern elsewhere in this app. `appId` is
   never parsed or decoded beyond what `getPinnedPreview` does internally —
   it's an opaque identifier from the caller's point of view.
3. **No pinned build yet** → a truthful "This app doesn't have a preview
   yet" empty state (not an error) — matches the catalog/overview's own
   "no preview yet" wording.
4. **A pinned build exists** → `renderPreview({ specification, path,
   basePath: routes.appPreview(appId) })`, fresh, on every request — this
   is what makes a deep link or refresh always resolve the *same* pinned
   version rather than something the browser could otherwise influence.
   - `errors` are all `unknown_page` → `notFound()` — the generated app's
     own 404 (`app/not-found.tsx`, "Page not found... doesn't exist in
     AppBuilder"), never a builder-internal message.
   - Any other top-level failure → a `PreviewDiagnostic` component: a list
     of `{ code, message }` pairs, already sanitized structured data from
     the runtime — never a stack trace, database value, or raw
     specification internal.
   - Success → `result.element`, directly.

### Archived-app policy

An archived app's pinned preview **still renders** at
`/apps/{appId}/preview` — `app.viewPreview` is one of the capabilities M03
deliberately keeps allowed while archived (`ALLOWED_WHILE_ARCHIVED` in
`lib/repositories/authz.ts`), consistent with "archiving blocks edits, not
viewing." This is a documented policy choice, not stale/leftover access:
archiving never deletes data, and the last successful preview is exactly as
valid to view after archiving as before. Requesting a **new** preview build
on an archived app is still blocked (`app.editSpecification` is not in
`ALLOWED_WHILE_ARCHIVED`) — `requestPreviewBuild` throws `ConflictError`.

## Catalog / continuation integration

`lib/repositories/appOverview.ts`'s `CatalogCardMetadata` and `AppOverview`
now expose `hasPreview` (`specifications.pinnedPreviewBuildId != null`)
**independently** of `previewStatus` (the most recent build *attempt's*
status). This matters: a failed rebuild attempt must never hide an app's
still-working, previously pinned preview. The catalog (`/apps`) shows a
"Preview ready" badge and the `/preview` link whenever `hasPreview` is true,
a "Preview failed" badge when the latest attempt failed (with the link
still shown if `hasPreview`), and nothing when no preview has ever been
requested. The continuation page (`/apps/[appId]`) additionally shows the
failed attempt's `errorMessage` as a safe diagnostic, and a "Build preview" /
"Rebuild preview" button (`app/apps/[appId]/previewActions.ts`) for anyone
with `app.editSpecification`. Catalog responses never include the full
specification JSON — unaffected by M06, already true from M05.

## Testing

- **Unit** (`packages/appbuilder-runtime/src/**/*.test.{ts,tsx}`, 71 tests):
  registry lookup and composite-key resolution; every registry entry's
  strict config schema (valid input, unknown-key rejection); URL
  sanitization; branding-token allowlist mapping; page resolution
  (homepage, path matching, nav-item filtering); `renderPreview` end-to-end
  against the real M04 construction fixture (every page, dashboard widgets,
  fail-closed on unknown kind/variant/config/binding, HTML-escaping,
  malformed-specification rejection, render-count-limit enforcement,
  the "zero-pages renders a safe empty state" special case); every
  template's validity, determinism, and homepage render.
- **Integration** (`apps/appbuilder/lib/repositories/previewService.integration.test.ts`,
  14 tests against real Postgres): build creation + pinning, idempotent
  reuse (no duplicate row), checksum-mismatch handling, failed-build
  preservation of the prior pinned pointer, capability enforcement
  (viewer rejected, editor allowed), leak-prevention (unrelated actor),
  archived-app blocking of new builds vs. continued viewing, audit events.
- **Playwright** (`apps/appbuilder/tests/e2e/`, 22 tests,
  `pnpm --filter @asafarim/appbuilder e2e`): a permanent browser-automation
  harness for AppBuilder (M05 shipped without one — see PR #46's own
  "Deferred" section). `global-setup.ts` seeds four real platform users
  (owner/editor/viewer/unrelated) and mints real Auth.js v5 session JWTs
  directly (`next-auth/jwt`'s `encode()`, same secret/cookie/algorithm the
  app itself decodes) rather than driving Hub's login UI — Playwright's own
  documented "reuse authenticated state" pattern, chosen because it's both
  more reliable and exercises the exact same authorization code path
  `getActor()` uses in production. Covers: the signed-out → Hub redirect
  boundary (absolute callback URL); the owner/editor/viewer/unrelated
  capability matrix; the archived-app view-only policy; the "no preview
  yet" state; the base route resolving the homepage (including top-level
  dashboard widgets); in-app navigation across projects/tasks/team;
  refresh/deep-link pinning stability; the generated-app 404 for an unknown
  page; an unknown component variant failing closed with a visible
  diagnostic and zero unexpected console errors; a deliberately
  bypass-seeded "succeeded" build carrying unsafe branding content (an
  `<b>`/`<i>`-laced company name and a `javascript:` logo URL) never
  executing or rendering as live markup; a full axe-core accessibility
  scan of the homepage and the projects (table + form) page; keyboard
  navigation reaching the skip link and every nav item in a working focus
  order; `prefers-reduced-motion` disabling the one CSS animation this
  package defines; zero horizontal overflow at 390/768/1024/1440px; and the
  backfilled core M05 flow (create → appears in `/apps` → continuation
  page → archive → restore).

## Explicit non-goals (M07/M08/M09)

- **No AI.** No OpenAI/LLM call, no natural-language interpretation of a
  creation prompt, no conversational editing. Templates are static, pure
  functions selected by id, not generated.
- **No functional generated-record persistence.** Every data-dependent
  registry entry shows deterministic demo data or a safe empty state,
  clearly labelled — M09 introduces the real data engine.
- **No background job system.** `requestPreviewBuild` is synchronous —
  sufficient for a homepage-only validation check. M07's own AI pipeline is
  where a real background-job architecture belongs; M06 doesn't
  preemptively build one.
- **No M08 builder workspace.** The preview route's CSP already permits
  same-origin `frame-ancestors` so M08 can embed it later, but M08's
  embedding/coordination logic itself is out of scope here.
- **No arbitrary code, package, or plugin loading of any kind.**

## For M07/M08 authors

- **M07** (AI planner) should write its generated specification through the
  same `applyOperation`/`specification_versions` path M04 already
  validates — this package's `validateSpecification` + `renderPreview` will
  reject anything unsafe or unsupported before it's ever pinned, exactly as
  they do for a hand-authored specification. Consider reusing
  `templates/*.ts` as reference shapes for what a "good" generated
  specification for a given starter family should look like.
- **M08** (builder workspace) can safely `<iframe>` `/apps/{appId}/preview`
  from the same origin (`frame-ancestors 'self'` already allows it) and
  should keep using `getPinnedPreview`/`requestPreviewBuild` rather than
  reaching into `renderPreview` directly — the service layer is what
  enforces authorization, pinning, and idempotency.
