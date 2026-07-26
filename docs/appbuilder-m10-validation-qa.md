# AppBuilder Validation Gates, Preview QA, and Bounded AI Repair (M10)

Implements issue #39 (milestone 10 of 12 in #29). Depends on M09 (#38, merged
in #50/#51/#52). Prevents an invalid or unsafe specification version from
being treated as "ready" by running a deterministic gate suite — including
real, browser-driven smoke tests against the generated app — and provides a
bounded, human-confirmed AI repair loop for the subset of failures that are
safely auto-fixable. **Does not implement deployment or production
release — that is M11.**

## Core principle: evidence, never narration

> "A gate cannot be marked passed based on model narration. It must have
> deterministic evidence."

Every gate returns one of a closed set of statuses
(`pending`/`running`/`passed`/`failed`/`skipped`/`infrastructure_error`/
`flaky`/`cancelled`) plus structured evidence — counts, ids, checksums, axe-core
violation objects, HTTP status codes actually observed. Nothing about a
gate's outcome is ever inferred from an AI model's own claim that something
"looks right." The repair loop's own model output (`RepairProposal.summary`,
`repairable`) is likewise never trusted alone — see
[Bounded AI repair](#bounded-ai-repair).

## Architecture

```
lib/validation/
  types.ts          GateContext / GateResult / GateDefinition contracts
  stateMachine.ts    validation_run status transitions
  limits.ts          VALIDATION_LIMITS + REPAIR_LIMITS
  eligibility.ts     computeReleaseEligibility (the ONE place this is decided)
  redaction.ts       bounds + redacts anything persisted/shown to the model
  baseline.ts        finds the last PASSED run to diff schema-evolution/destructive-safety against
  artifacts.ts       persists a gate's screenshot/trace/report/log via @asafarim/storage
  pipeline.ts        the durable-worker driver — runs every gate, in order, for one run
  smoke/
    authSession.ts   mints a real next-auth session for the owner (builder-only)
    harness.ts       launches an isolated chromium context against the running app
  gates/
    registry.ts      GATE_SET_VERSION + the ordered list of all 16 gates
    <16 gate files>

lib/repair/
  stateMachine.ts    repair_attempt status transitions
  classify.ts        classifyValidationFailure — the closed failure-classification vocabulary
  confirmation.ts    checksum/expiry/base-version binding (mirrors M08's modification confirmation)
  errors.ts          RepairJobError + classifyRepairError
  pipeline.ts        classify -> propose -> [confirm] -> apply (M04) -> new preview -> new validation run

lib/repositories/
  validationRuns.ts  enqueue/claim/transition/cancel/finalize/read, all capability-checked
  repairAttempts.ts  same shape, for repair attempts

packages/appbuilder-ai/
  schemas/repairProposal.ts       RepairProposal (reuses OperationBatch verbatim)
  prompts/buildRepairPrompt.ts
  provider/types.ts               AiProvider.proposeRepair
  fixtures/repair.ts              deterministic fake-provider repair scripts
```

## Run/version pinning

A `validation_runs` row is created once, at request time, and its identity
columns are **never updated afterward**:

- `specificationVersionId` + `specificationChecksum` — the app's *current*
  specification version at the moment the run was requested (never
  re-derived from "whatever the app is at now" once the row exists — see
  `lib/repositories/validationRuns.ts#enqueueValidationRun`).
- `previewBuildId` + `previewChecksum` — the succeeded preview build for
  that exact version+registry, if one already existed; otherwise the
  pipeline builds one before running preview-dependent gates (issue step 5,
  "build a controlled test environment for the pinned preview") — but only
  if the app's current version still matches what this run pinned. If a
  concurrent edit moved the app on, the pin is left null and
  preview-dependent gates fail closed rather than silently validating the
  wrong version under this run's identity.
- `registryVersion` — `@asafarim/appbuilder-runtime`'s `REGISTRY_VERSION` at
  creation time.
- `gateSetVersion` — `lib/validation/gates/registry.ts#GATE_SET_VERSION`,
  bumped whenever the gate catalog changes materially. An old run's
  evidence stays interpretable even after gates are added/changed.

Rerunning validation for a changed spec always means **creating a new run**,
never mutating the old one's pinned identity, status, gate results, or
artifacts once it reaches a terminal status.

## The 16 mandatory gates

Ordered cheapest/most-structural first (`lib/validation/gates/registry.ts`)
so a run surfaces a schema-level problem before spending time on a
browser-driven smoke gate — every gate still always runs; a failing gate
never skips the rest.

| Gate key | What it checks | Deterministic evidence |
|---|---|---|
| `spec_schema_validity` | Structural shape: duplicate ids/names, reserved names, content-safety sweep | `validateSpecification` issue list minus reference codes |
| `reference_integrity` | Every relation/permission/nav/workflow target resolves | `validateSpecification`'s `orphaned_reference`/`circular_reference` issues |
| `operation_legality` | Pinned version's checksum still matches its payload; any recorded producing operation still parses against the current allowlist | checksum comparison, `Operation.safeParse` result |
| `registry_validity` | Every component/widget resolves to an approved `@asafarim/appbuilder-runtime` registry entry | `resolveComponentEntry` per component |
| `preview_renderability` | The pinned build succeeded AND every non-archived page renders without a registry-level failure | `renderPreview` result per page |
| `permissions_authorization` | Every role/entity pair reachable through a page or a relation field has an **explicit** read-permission decision (allow OR deny) | reachability graph vs. decided `(roleId, entityId, verb)` tuples — this is the exact class of bug M10 was scoped to catch (M09's `team_member` gap, fixed in commit 637fea1) |
| `unsafe_content_policy` | No script/event-handler injection, dangerous config keys, or non-allowlisted external URL | content-safety sweep + allowlisted-domain URL scan |
| `schema_evolution_safety` | No field change since the last **passed** baseline requires an unreviewed migration; no tightened constraint is violated by existing data | `classifyEntityEvolution`/`checkExistingRecordsAgainstField` (M09, reused directly) |
| `file_storage_policy` | Storage boundary resolves; file-field MIME/size config is well-formed; download-token secret isn't a default outside dev/test | `getStorageStatus`, field config shape checks |
| `required_pages_routes` | A home page exists; every page's route resolves uniquely; every nav item targets a real, non-archived page | `resolveHomePage`/`resolvePageByPath` |
| `accessibility_baseline` | No WCAG 2.1 AA serious/critical violation on the home page + up to 2 more (demo mode — no seed data required) | real `@axe-core/playwright` scan |
| `responsive_layout_baseline` | No horizontal overflow at a 375px viewport; primary nav remains reachable | real browser measurement + screenshot artifact |
| `generated_data_crud_smoke` | Authenticated admin access, dashboard render, project/task create with relation assignment, archive/restore | real browser driving the live preview (`?mode=live`) |
| `role_denial_journeys` | A role without a permission is denied both in nav/UI and server-side at the runtime API | real browser + `?simulateRoleId=` |
| `workflow_idempotency` | Retrying a record create with the same idempotency key never re-executes an `onCreate` workflow or duplicates its side effects | direct repository-layer check (deterministic; not browser-driven — see below) |
| `migration_destructive_safety` | Every destructive change since the last passed baseline is traceable to a confirmed, recorded operation, never an unreviewed direct edit | `classifyDestructiveChange` replay + structural diff for directly-appended versions |

### Two documented scope boundaries

- **`generated_data_crud_smoke` / `role_denial_journeys`** are only
  implemented against the shipped `task_management` fixture shape today
  (`lib/validation/gates/taskManagementShape.ts`). Any other specification
  shape **skips** these gates with an explicit reason — never a false pass.
  Extending fixture coverage to other template families is explicit
  follow-up work, not silently expanded here.
- **`workflow_idempotency`** is exercised at the repository layer
  (`lib/generated-data/records.ts#createRecord` called twice with the same
  idempotency key), not through a browser — idempotency is a backend
  correctness property. It **skips with `mandatoryOverride: false`** when a
  specification defines zero `onCreate` workflows (legitimately not
  applicable — see [Release eligibility](#release-eligibility-contract)).
  Every *other* skip reason for this gate stays mandatory.

## Bounded AI repair

Extends M07's `AiProvider` (`proposeRepair`) and M08's dry-run/confirm/apply
machinery — **not a second orchestration system**:

1. **Classify** (`lib/repair/classify.ts`) — a closed vocabulary:
   `user_specification_error`, `supported_repairable_configuration_error`,
   `unsupported_product_capability`, `test_failure`,
   `accessibility_failure`, `security_policy_failure`,
   `migration_data_safety_failure`, `provider_failure`,
   `infrastructure_failure`, `flaky_test`, `cancellation`.
   `infrastructure_failure`/`flaky_test`/`cancellation` are **never**
   repairable, regardless of what the model itself claims — the pipeline
   refuses to even call `proposeRepair` for them. Permission-shaped
   failures are always classified `security_policy_failure` (a distinct,
   extra-scrutiny bucket) even when the actual defect is a missing grant.
2. **Gather bounded, sanitized diagnostics** — every diagnostic ever shown
   to the model or persisted passes through `lib/validation/redaction.ts`
   (reuses `@asafarim/appbuilder-ai`'s redaction layer), which bounds array
   length, truncates strings, and drops never-log keys outright.
3. **Propose** (`AiProvider.proposeRepair`) — a single bounded operation
   batch (`REPAIR_LIMITS.MAX_OPERATIONS_PER_ATTEMPT`), reusing
   `OperationBatch` verbatim (never a parallel operation vocabulary).
4. **Validate** — a pure dry run through `applySpecOperation`
   (`lib/repair/pipeline.ts#runProposingPhase`), identical in shape to
   M08's `runProposingPhase`.
5. **Confirm if destructive** — reuses `lib/modification/confirmation.ts`'s
   checksum/expiry/actor/base-version binding contract directly
   (`lib/repair/confirmation.ts` mirrors it over `repair_attempts`). No
   auto-confirmation ever, for any classification.
6. **Apply via M04** — the only phase that calls the DB-backed,
   capability-checked `applyOperation` (`lib/repair/pipeline.ts#runApplyingPhase`).
7. **New preview** — `requestPreviewBuild` against the newly applied version.
8. **Revalidate from scratch** — enqueues a **brand-new** `validation_runs`
   row (`requestSource: "repair"`, `triggeringRepairAttemptId`) and polls
   until it reaches a terminal status. The repair attempt only reaches
   `completed` if that new run reaches `passed` — **never** on the model's
   claim that the fix worked.

### Repair limits (`lib/validation/limits.ts#REPAIR_LIMITS`)

| Limit | Value | Enforcement |
|---|---|---|
| Max repair attempts per run | 3 | Application logic AND a DB unique index on `(originatingRunId, attemptNumber)` — a race fails closed at the database |
| Max operations per attempt | 6 | Application logic (`MAX_OPERATIONS_PER_ATTEMPT`) |
| Max attempt wall-clock time | 10 minutes | `runRevalidatingPhase`'s poll deadline — exceeding it fails as `repair_budget_exhausted` |
| Confirmation TTL | 15 minutes | Same as M08's modification confirmation |
| Max job-execution retries (infra failures only) | 3 | `RETRYABLE_FAILURE_CODES` — never applies to `not_repairable`/`repair_budget_exhausted` |

Explicit cancellation (`requestCancellation`) follows the exact
queued-vs-cooperative split M07/M08 already established: `queued` cancels
immediately; anything mid-flight only sets `cancelRequestedAt`, checked at
every phase boundary in `lib/repair/pipeline.ts`'s main loop — **no repair
step ever proceeds after a cancellation request is observed.**

Never touches a released/published specification version — repairs operate
on the current draft only (see `migration_destructive_safety` and the
repository-level "released-version immutability" integration test).

## Artifacts

Screenshots, axe-core reports, and structured diagnostics
(`lib/validation/artifacts.ts`) are written through the same
`@asafarim/storage` boundary M09's file uploads use (S3-compatible in
production, local-file fallback in dev/test) — never a client-determined
path (`buildKey` always mints the storage key). Every artifact is scoped by
`(runId, appId, gateKey?)`, access-controlled identically to the run itself
(`app.viewValidation`), and stamped with `retentionExpiresAt` at write time
(`VALIDATION_LIMITS.ARTIFACT_RETENTION_MS`, 30 days) — a request for an
expired artifact returns 410, not the bytes. Oversized bodies are truncated
rather than persisted whole (`MAX_ARTIFACT_BYTES`). Diagnostics text is
always redacted before persistence — never a raw cookie/session
token/authorization header.

**Retention cleanup**: no scheduled job exists yet to physically delete
expired rows/objects — the `retentionExpiresAt` column and the 410 response
are the enforced *access* boundary today; a periodic sweep to reclaim
storage is explicit follow-up work.

## Release eligibility contract

`lib/validation/eligibility.ts#computeReleaseEligibility` is the **one**
place this is decided:

> A run is release-eligible if and only if it is `passed` AND every
> mandatory gate reached `passed` specifically.

`skipped` **never** counts, even for a legitimate skip reason — "we have no
evidence either way" is not the same as positive evidence, and eligibility
requires positive evidence. The one exception is a gate whose own result
sets `mandatoryOverride: false` (currently only `workflow_idempotency`, when
zero workflows exist to test) — that gate is excluded from the mandatory
count entirely for *this run*, rather than either falsely passing or
falsely blocking eligibility for a capability the app doesn't have.

**Known consequence**: the shipped `task_management` template defines zero
workflows, so `workflow_idempotency` always skips (non-mandatory) for it —
this is fine; every *other* mandatory gate still gates eligibility normally.
A specification whose `generated_data_crud_smoke`/`role_denial_journeys`
gates skip (non-`task_management` shape) is **never** release-eligible under
today's fixture coverage — an explicit, disclosed scope boundary, not a
bug — see [Two documented scope boundaries](#two-documented-scope-boundaries).

## Flaky/infrastructure policy

A run's final status is decided in `lib/validation/pipeline.ts`:

```
infrastructure_error > flaky > failed > passed
```

(highest-priority outcome wins). If *any* gate hit `infrastructure_error`
(e.g. the browser smoke harness couldn't launch chromium — see
`lib/validation/smoke/harness.ts#SmokeHarnessUnavailableError`), the whole
run is `infrastructure_error`, never `failed` — this is never treated as a
verdict on the generated app, and `lib/repair/classify.ts` refuses to
attempt a repair for it. The same holds for `flaky`. **Neither status is
ever silently rewritten as a passing or failing app-behavior signal** — an
operator or builder must rerun once the environment issue is resolved.

## Operator troubleshooting

- **A validation run stays `pending` forever**: check the worker process is
  running and its `VALIDATION_QUEUE_NAME` (`appbuilder-validation`) BullMQ
  queue is being consumed — `lib/server/queue.ts`. The worker's stale-lease
  sweep (`VALIDATION_SWEEP_INTERVAL_MS`, 60s) will eventually pick up any
  run whose dispatch message was lost, so correctness never depends on
  Redis delivery, only latency.
- **Every browser-driven gate reports `infrastructure_error` with
  `smoke_harness_unavailable`**: the worker's runtime environment is
  missing Chromium. Run `npx playwright install --with-deps chromium` in
  the worker's container/host — see `tsup.worker.config.ts`'s comment on
  why `playwright-core`/`@axe-core/playwright` are kept external rather
  than bundled.
- **`file_storage_policy` fails with `storage_not_remote_in_production`**:
  `STORAGE_DRIVER`/`STORAGE_ENDPOINT` etc. are not configured for the
  worker's environment — see `packages/storage`'s config resolution.
- **A repair attempt is stuck in `revalidating`**: it is polling its own
  newly-created validation run every 3 seconds, bounded by
  `MAX_ATTEMPT_WALL_TIME_MS` (10 minutes) — check that NEW run's own status
  via `GET /api/apps/{appId}/validation-runs/{newRunId}` directly.
- **A gate result never updates on retry**: `validation_gate_results` has a
  unique `(runId, gateKey)` index — a re-executed gate replaces its own
  prior row (`upsertGateResult`'s `onConflictDoUpdate`), it never
  accumulates duplicates.

## M11 deployment deferral

M10 computes release eligibility; it **does not** publish, deploy, or
provision anything. `app.deployRelease` and the `releases`/`deployments`
tables predate this milestone (scaffolded in earlier work) and are
untouched here — M11 owns turning a release-eligible validation run into an
actual published, deployed generated app with a real domain. This milestone
also does not implement: production deployment, domain provisioning,
custom domains, arbitrary external-site testing, unrestricted autonomous
repair, arbitrary code generation, payment/billing, or code export.

## Auditability

Every lifecycle transition is audited via the same
`lib/repositories/audit.ts#recordAuditEvent` mechanism as every other
milestone — `validation.requested/started/passed/failed/infrastructure_error/flaky/cancelled`
and `repair.requested/proposed/confirmed/completed/failed/cancelled/cancellation_requested`
— there is no separate audit log for this milestone.

## Testing

- **Unit** (`lib/validation/*.test.ts`, `lib/repair/*.test.ts`,
  `lib/validation/gates/*.test.ts`): state machines, eligibility
  calculation, failure classification, redaction bounds, confirmation
  binding, the gate catalog's own integrity, and the exact M09
  `permissions_authorization` bug reproduced as a pure-function test — no
  database.
- **Integration** (`lib/repositories/validationRuns.integration.test.ts`,
  `lib/repositories/repairAttempts.integration.test.ts`, real Postgres):
  immutable pinning, idempotency, permission enforcement, cross-app
  isolation, gate-result persistence (pass/fail/retry-replace),
  cancellation semantics, the repair-attempt lifecycle including
  confirmation binding, no-duplicate-versions-on-retry, and
  released-version immutability.
- **Playwright** (`tests/e2e/specs/m10-validation-repair.spec.ts`, real
  worker + real browser-driven gates, deterministic fake AI provider):
  requesting validation from the builder, inspecting gates/artifacts, a
  failed task-management run, a successful run after a safe repair, a
  destructive repair's confirmation prompt, repair cancellation, mobile +
  keyboard access to the Validation tab, and unrelated-user denial. Fixture
  apps are dedicated to this suite (`m10PassingAppId`/`m10BrokenAppId`/
  `m10NarrowAppId` in `tests/e2e/global-setup.ts`) — never the shared M09
  fixtures, since these tests deliberately mutate permissions.

All automated tests use the fake AI provider and fake/local storage
exclusively. No real-provider smoke test exists for M10 (none was needed —
`proposeRepair`'s fixtures fully exercise the confirmation/apply/revalidate
mechanics deterministically).
