import path from "node:path";
import fs from "node:fs/promises";
import { config as loadEnv } from "dotenv";

// Playwright's globalSetup runs standalone (not through Next.js), so env
// vars must be loaded the same way every other script in this app does —
// see next.config.ts / lib/db/seed.ts. Every module below that reads an env
// var at import time (@asafarim/db's Prisma client, lib/db/client.ts) is
// imported *dynamically*, after these loadEnv() calls run — static
// top-level imports are hoisted above this code by the ESM spec, which
// would read process.env before dotenv ever populated it.
loadEnv({ path: path.join(__dirname, "../../../../.env.local") });
loadEnv({ path: path.join(__dirname, "../../../../.env") });

import type { ApplicationSpecificationType } from "@asafarim/appbuilder-schema";
import type { Db } from "../../lib/db/client";

const AUTH_DIR = path.join(__dirname, ".auth");
const RUN_ID = Date.now().toString(36);

async function upsertUser(prisma: typeof import("@asafarim/db").prisma, email: string, name: string, username: string) {
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, username, emailVerified: new Date() },
  });
}

/** Appends a new immutable specification version directly (bypassing the M04 operation engine, the same pattern used in lib/repositories/previewService.integration.test.ts) and advances the pointer. */
async function appendSpecVersion(
  db: Db,
  appId: string,
  payload: ApplicationSpecificationType,
  deps: {
    eq: typeof import("drizzle-orm").eq;
    schema: typeof import("../../lib/db/schema");
    checksumOf: typeof import("@asafarim/appbuilder-schema").checksumOf;
    generateId: typeof import("../../lib/db/ids").generateId;
    SPEC_SCHEMA_VERSION: string;
    ENGINE_VERSION: string;
  },
): Promise<void> {
  const { eq, schema, checksumOf, generateId, SPEC_SCHEMA_VERSION, ENGINE_VERSION } = deps;
  const [spec] = await db.select().from(schema.specifications).where(eq(schema.specifications.appId, appId));
  const nextVersion = spec.currentVersionNumber + 1;

  await db.insert(schema.specificationVersions).values({
    id: generateId(),
    specificationId: spec.id,
    appId,
    versionNumber: nextVersion,
    schemaVersion: SPEC_SCHEMA_VERSION as ApplicationSpecificationType["schemaVersion"],
    engineVersion: ENGINE_VERSION,
    summary: "E2E fixture content",
    payload,
    checksum: checksumOf(payload),
    createdByPrincipalId: "e2e-seed",
  });
  await db.update(schema.specifications).set({ currentVersionNumber: nextVersion }).where(eq(schema.specifications.id, spec.id));
}

/**
 * Directly inserts a "succeeded", pinned preview build carrying content the
 * normal `requestPreviewBuild` path would never let through (its own
 * `validateSpecification` call rejects `<script>`/inline-event-handler
 * patterns before a build is ever created) — simulating "what if a future
 * bug let unsafe content reach a pinned build anyway." Proves the
 * *renderer's* own defense-in-depth (escaped text, sanitized URLs, no
 * `dangerouslySetInnerHTML`) independent of the upstream validation gate.
 */
async function seedUnsafeSucceededBuild(
  db: Db,
  appId: string,
  deps: {
    eq: typeof import("drizzle-orm").eq;
    schema: typeof import("../../lib/db/schema");
    checksumOf: typeof import("@asafarim/appbuilder-schema").checksumOf;
    generateId: typeof import("../../lib/db/ids").generateId;
    SPEC_SCHEMA_VERSION: string;
    ENGINE_VERSION: string;
    REGISTRY_VERSION: string;
  },
): Promise<void> {
  const { eq, schema, checksumOf, generateId, SPEC_SCHEMA_VERSION, ENGINE_VERSION, REGISTRY_VERSION } = deps;
  const [spec] = await db.select().from(schema.specifications).where(eq(schema.specifications.appId, appId));
  const nextVersion = spec.currentVersionNumber + 1;

  const payload: ApplicationSpecificationType = {
    schemaVersion: SPEC_SCHEMA_VERSION as ApplicationSpecificationType["schemaVersion"],
    app: { name: "Security Proof", slug: "security-proof-e2e" },
    branding: {
      companyName: "<b>Bold</b> & <i>Italic</i> Co",
      logoUrl: "javascript:alert(1)",
      theme: "system",
    },
    entities: [
      {
        id: "widget",
        machineName: "widget",
        name: "Widget",
        archived: false,
        fields: [{ id: "name", machineName: "name", name: "Name", type: "text", required: true, unique: false, archived: false }],
        indexes: [],
      },
    ],
    relations: [],
    roles: [],
    permissions: [],
    navigation: [{ id: "nav_home", label: "Home", targetPageId: "home", order: 0 }],
    pages: [
      {
        id: "home",
        name: "Home",
        path: "home",
        archived: false,
        components: [
          // Unknown variant of a known kind — must fail closed with an
          // inline diagnostic, never a blank/crashed page.
          { id: "c_unknown", kind: "dataTable", entityId: "widget", config: { variant: "not-a-real-variant" }, order: 0 },
        ],
      },
    ],
    dashboard: { widgets: [] },
    actions: [],
    workflows: [],
  };

  const versionId = generateId();
  await db.insert(schema.specificationVersions).values({
    id: versionId,
    specificationId: spec.id,
    appId,
    versionNumber: nextVersion,
    schemaVersion: SPEC_SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    summary: "E2E security-proof fixture (bypasses normal validation deliberately)",
    payload,
    checksum: checksumOf(payload),
    createdByPrincipalId: "e2e-seed",
  });
  await db.update(schema.specifications).set({ currentVersionNumber: nextVersion }).where(eq(schema.specifications.id, spec.id));

  const buildId = generateId();
  await db.insert(schema.previewBuilds).values({
    id: buildId,
    appId,
    specificationVersionId: versionId,
    checksum: checksumOf(payload),
    registryVersion: REGISTRY_VERSION,
    status: "succeeded",
    requestedByPrincipalId: "e2e-seed",
    startedAt: new Date(),
    completedAt: new Date(),
  });
  await db.update(schema.specifications).set({ pinnedPreviewBuildId: buildId }).where(eq(schema.specifications.id, spec.id));
}

function fixtureSpec(
  fixture: ApplicationSpecificationType,
  name: string,
  slug: string,
  description: string,
): ApplicationSpecificationType {
  return { ...fixture, app: { name, slug, description } };
}

export default async function globalSetup(): Promise<void> {
  await fs.mkdir(AUTH_DIR, { recursive: true });

  const { prisma } = await import("@asafarim/db");
  const { eq } = await import("drizzle-orm");
  const { checksumOf, ENGINE_VERSION, SPEC_SCHEMA_VERSION } = await import("@asafarim/appbuilder-schema");
  const { constructionTaskManagementFixture } = await import("@asafarim/appbuilder-schema/fixtures");
  const { REGISTRY_VERSION, getTemplate } = await import("@asafarim/appbuilder-runtime");
  const { getDb, closeDb } = await import("../../lib/db/client");
  const { generateId } = await import("../../lib/db/ids");
  const schema = await import("../../lib/db/schema");
  const { archiveApp, createApp } = await import("../../lib/repositories/apps");
  const { addCollaborator } = await import("../../lib/repositories/collaborators");
  const { requestPreviewBuild } = await import("../../lib/repositories/previewService");
  const { applyOperation } = await import("../../lib/repositories/operations");
  const { applyTemplateVersion } = await import("../../lib/repositories/templateApplication");
  const { resetGeneratedData } = await import("../../lib/generated-data/seed");
  const { buildStorageState } = await import("./fixtures/session");

  const versionDeps = { eq, schema, checksumOf, generateId, SPEC_SCHEMA_VERSION, ENGINE_VERSION };

  const [owner, editor, viewer, unrelated] = await Promise.all([
    upsertUser(prisma, "e2e-owner@example.test", "E2E Owner", `e2e_owner_${RUN_ID}`),
    upsertUser(prisma, "e2e-editor@example.test", "E2E Editor", `e2e_editor_${RUN_ID}`),
    upsertUser(prisma, "e2e-viewer@example.test", "E2E Viewer", `e2e_viewer_${RUN_ID}`),
    upsertUser(prisma, "e2e-unrelated@example.test", "E2E Unrelated", `e2e_unrelated_${RUN_ID}`),
  ]);

  const db = getDb();
  const ownerActor = { principalId: owner.id, roles: [] as string[] };

  // 1. The construction task-manager proof app — dashboard/projects/tasks/team/settings,
  //    a real succeeded pinned preview, and editor/viewer collaborators for the capability matrix.
  const demoApp = await createApp(
    db,
    ownerActor,
    {
      name: "Construction Task Manager",
      slug: `e2e-construction-tasks-${RUN_ID}`,
      description: "E2E fixture — the M04 construction task-management specification.",
      starterFamily: "task_management",
      visibility: "private",
    },
    `e2e-seed-demo-${RUN_ID}`,
  );
  await appendSpecVersion(
    db,
    demoApp.id,
    fixtureSpec(
      constructionTaskManagementFixture,
      "Construction Task Manager",
      demoApp.slug,
      "E2E fixture — the M04 construction task-management specification.",
    ),
    versionDeps,
  );
  await addCollaborator(db, ownerActor, demoApp.id, editor.id, "editor");
  await addCollaborator(db, ownerActor, demoApp.id, viewer.id, "viewer");
  await requestPreviewBuild(db, ownerActor, demoApp.id);

  // 2. An archived app with a succeeded preview — verifies the documented
  //    policy that viewing a preview stays allowed while archived.
  const archivedApp = await createApp(
    db,
    ownerActor,
    { name: "Archived Demo", slug: `e2e-archived-demo-${RUN_ID}`, starterFamily: "blank", visibility: "private" },
    `e2e-seed-archived-${RUN_ID}`,
  );
  await appendSpecVersion(
    db,
    archivedApp.id,
    fixtureSpec(constructionTaskManagementFixture, "Archived Demo", archivedApp.slug, "E2E archived-app fixture."),
    versionDeps,
  );
  await requestPreviewBuild(db, ownerActor, archivedApp.id);
  await archiveApp(db, ownerActor, archivedApp.id);

  // 3. Never built — the catalog/overview "no preview yet" state.
  const noPreviewApp = await createApp(
    db,
    ownerActor,
    { name: "No Preview Yet", slug: `e2e-no-preview-${RUN_ID}`, starterFamily: "blank", visibility: "private" },
    `e2e-seed-nopreview-${RUN_ID}`,
  );

  // 4. Security-proof app — see seedUnsafeSucceededBuild's docstring.
  const securityApp = await createApp(
    db,
    ownerActor,
    { name: "Security Proof", slug: `e2e-security-${RUN_ID}`, starterFamily: "blank", visibility: "private" },
    `e2e-seed-security-${RUN_ID}`,
  );
  await seedUnsafeSucceededBuild(db, securityApp.id, { ...versionDeps, REGISTRY_VERSION });

  // 5. M08 builder-workspace apps — a minimal task/tasks_table/employee_role
  //    spec built through the real M04 operation engine (not
  //    appendSpecVersion's bypass) so each app's version history/checksum/
  //    provenance chain looks exactly like a real user's app. Deliberately
  //    does NOT have a `priority` field on `task` yet — unlike
  //    constructionTaskManagementFixture above, which already does — so the
  //    "add task priority conversationally" golden path has something real
  //    to add. Ids match packages/appbuilder-ai's M08 fake-provider fixtures
  //    (fixtures/modification.ts) exactly.
  //
  //    One INDEPENDENT app per test that drives a modification job to
  //    completion (rather than one shared app) — a job left
  //    `awaiting_confirmation`/non-terminal by one test would otherwise
  //    auto-open ConversationPanel's confirm dialog on every OTHER test's
  //    fresh page load against the same app (it polls the app's latest job
  //    regardless of which test navigated there), blocking clicks with the
  //    dialog overlay. Read-only/layout-only tests still share `builderApp`.
  async function seedBuilderWorkspaceApp(suffix: string) {
    const app = await createApp(
      db,
      ownerActor,
      { name: `Builder Workspace Demo ${suffix}`, slug: `e2e-builder-workspace-${suffix}-${RUN_ID}`, starterFamily: "blank", visibility: "private" },
      `e2e-seed-builder-${suffix}-${RUN_ID}`,
    );
    let bv = 1;
    await applyOperation(db, ownerActor, app.id, {
      operation: { opVersion: "1.0.0", type: "CREATE_ENTITY", entity: { id: "task", machineName: "task", name: "Task" } },
      baseVersionNumber: bv++,
      idempotencyKey: `e2e-builder-${suffix}-${RUN_ID}-create-entity`,
    });
    await applyOperation(db, ownerActor, app.id, {
      operation: {
        opVersion: "1.0.0",
        type: "ADD_FIELD",
        entityId: "task",
        field: { id: "title", machineName: "title", name: "Title", type: "text", required: true, unique: false, archived: false },
      },
      baseVersionNumber: bv++,
      idempotencyKey: `e2e-builder-${suffix}-${RUN_ID}-add-title`,
    });
    await applyOperation(db, ownerActor, app.id, {
      operation: { opVersion: "1.0.0", type: "CREATE_PAGE", page: { id: "tasks", name: "Tasks", path: "tasks" } },
      baseVersionNumber: bv++,
      idempotencyKey: `e2e-builder-${suffix}-${RUN_ID}-create-page`,
    });
    await applyOperation(db, ownerActor, app.id, {
      operation: {
        opVersion: "1.0.0",
        type: "ADD_COMPONENT",
        pageId: "tasks",
        component: { id: "tasks_table", kind: "dataTable", entityId: "task", config: { variant: "table" }, order: 0 },
      },
      baseVersionNumber: bv++,
      idempotencyKey: `e2e-builder-${suffix}-${RUN_ID}-add-component`,
    });
    await applyOperation(db, ownerActor, app.id, {
      operation: { opVersion: "1.0.0", type: "CREATE_ROLE", role: { id: "employee_role", name: "Employee" } },
      baseVersionNumber: bv++,
      idempotencyKey: `e2e-builder-${suffix}-${RUN_ID}-create-role`,
    });
    await applyOperation(db, ownerActor, app.id, {
      operation: {
        opVersion: "1.0.0",
        type: "SET_PERMISSION",
        permission: { id: "perm_employee_task_delete", roleId: "employee_role", entityId: "task", verb: "delete", effect: "allow" },
      },
      baseVersionNumber: bv++,
      idempotencyKey: `e2e-builder-${suffix}-${RUN_ID}-set-permission`,
    });
    await addCollaborator(db, ownerActor, app.id, editor.id, "editor");
    await addCollaborator(db, ownerActor, app.id, viewer.id, "viewer");
    await requestPreviewBuild(db, ownerActor, app.id);
    return app;
  }

  const builderApp = await seedBuilderWorkspaceApp("main");
  const builderAppPriority = await seedBuilderWorkspaceApp("priority");
  const builderAppSelection = await seedBuilderWorkspaceApp("selection");
  const builderAppDestructive = await seedBuilderWorkspaceApp("destructive");
  const builderAppHistory = await seedBuilderWorkspaceApp("history");
  const builderAppAdversarial = await seedBuilderWorkspaceApp("adversarial");
  const builderAppA11yDialog = await seedBuilderWorkspaceApp("a11y-dialog");
  const builderAppA11yMotion = await seedBuilderWorkspaceApp("a11y-motion");

  // 6. M09 generated-data-engine fixtures — the UNMODIFIED
  //    `task_management` template from
  //    packages/appbuilder-runtime/src/templates/taskManagement.ts, applied
  //    via `applyTemplateVersion` (the same bulk-template-application path
  //    the real M07 generation pipeline uses — see lib/generation/pipeline.ts
  //    #runPlanningIteration), never `appendSpecVersion`'s bypass and never
  //    `constructionTaskManagementFixture` (the *different* M04 fixture
  //    `demoApp` above uses, whose entity/field ids don't match).
  //    lib/generated-data/seed.ts's hardcoded TASK_MGMT_IDS match this
  //    template's ids exactly, so `resetGeneratedData` can seed real
  //    project/task/team_member rows against it. Two independent apps: one
  //    for the main M09 golden-path/RBAC suite, one purely so the
  //    cross-app-isolation test has a second app's record id to probe.
  async function seedM09App(suffix: string) {
    const app = await createApp(
      db,
      ownerActor,
      {
        name: `M09 Task Manager ${suffix}`,
        slug: `e2e-m09-tasks-${suffix}-${RUN_ID}`,
        description: "E2E fixture — the M09 generated-data engine, unmodified task_management template.",
        starterFamily: "task_management",
        visibility: "private",
      },
      `e2e-seed-m09-${suffix}-${RUN_ID}`,
    );
    const template = getTemplate("task_management");
    if (!template) throw new Error("task_management template is not registered in @asafarim/appbuilder-runtime");
    await applyTemplateVersion(db, ownerActor, app.id, {
      template,
      baseVersionNumber: 1,
      idempotencyKey: `e2e-seed-m09-${suffix}-${RUN_ID}-template`,
    });
    await requestPreviewBuild(db, ownerActor, app.id);
    // Pre-seeds deterministic demo data AND bootstraps the owner as the
    // first real generated-app admin member (see seed.ts's docstring) — the
    // owner Playwright session can therefore exercise real (non-simulated)
    // admin-level M09 assertions directly, no `?simulateRoleId=` needed.
    await resetGeneratedData(db, ownerActor, app.id, { confirm: true });
    return app;
  }

  const m09App = await seedM09App("main");
  const m09AppSecondary = await seedM09App("secondary");

  // 3. M10 validation/repair fixtures — each its OWN dedicated app (never
  //    shared with the M09 suite above) since these tests deliberately
  //    mutate permissions to reproduce failure scenarios.
  const m10PassingApp = await seedM09App("m10-passing"); // unmodified template — every M10 gate should be able to run/pass against it.

  const m10BrokenApp = await seedM09App("m10-broken");
  // Reproduces the exact pre-fix M09 bug (see commit 637fea1): remove the
  // employee_role -> team_member read permission so
  // permissions_authorization fails, and the fake repair provider's
  // REPAIR_ADD_MISSING_PERMISSION_SCRIPT fixture (packages/appbuilder-ai/src/fixtures/repair.ts)
  // proposes re-adding exactly this grant.
  await applyOperation(db, ownerActor, m10BrokenApp.id, {
    operation: { opVersion: "1.0.0", type: "REMOVE_PERMISSION", permissionId: "perm_employee_team_member_read" },
    baseVersionNumber: 2, // v1 root, v2 = the applied template
    idempotencyKey: `e2e-seed-m10-broken-remove-perm-${RUN_ID}`,
    confirmDestructive: true, // deliberately reproducing a pre-fix bug state, not exercising the confirmation flow here
  });
  await requestPreviewBuild(db, ownerActor, m10BrokenApp.id);

  // 7. M11 releases/deployment fixtures — a real, fully-deployed production
  //    app (prepared, approved, and activated through the ACTUAL pipeline —
  //    lib/deployment/pipeline.ts — not a shortcut), so e2e specs can hit
  //    `https://{slug}.apps.asafarim.com` via an explicit Host header
  //    against this same dev server with zero public DNS involved. Every
  //    step goes through the real repositories (prepareRelease,
  //    approveRelease, createDeployment, runDeploymentJob) exactly as the
  //    deployment worker would, including a real internal HTTP
  //    self-verification request.
  const appbuilderBaseUrl = process.env.NEXT_PUBLIC_APPBUILDER_URL || "http://localhost:3006";
  async function seedM11DeployedApp(suffix: string) {
    const app = await createApp(
      db,
      ownerActor,
      {
        name: `M11 Deployed App ${suffix}`,
        slug: `e2e-m11-${suffix}-${RUN_ID}`,
        description: "E2E fixture — a real M11 production deployment.",
        starterFamily: "task_management",
        visibility: "private",
      },
      `e2e-seed-m11-${suffix}-${RUN_ID}`,
    );
    const template = getTemplate("task_management");
    if (!template) throw new Error("task_management template is not registered in @asafarim/appbuilder-runtime");
    await applyTemplateVersion(db, ownerActor, app.id, { template, baseVersionNumber: 1, idempotencyKey: `e2e-seed-m11-${suffix}-${RUN_ID}-template` });
    const { build } = await requestPreviewBuild(db, ownerActor, app.id);

    const { enqueueValidationRun, transitionStatus, upsertGateResult, finalizeRun } = await import("../../lib/repositories/validationRuns");
    const run = await enqueueValidationRun(db, ownerActor, app.id, { idempotencyKey: `e2e-seed-m11-${suffix}-${RUN_ID}-run`, requestSource: "manual" });
    await transitionStatus(db, run.id, "pending", "running");
    await upsertGateResult(db, {
      runId: run.id,
      appId: app.id,
      gateKey: "spec_schema_validity",
      gateVersion: "1.0.0",
      mandatory: true,
      result: { status: "passed" },
      startedAt: new Date(),
      completedAt: new Date(),
      artifactIds: [],
    });
    await finalizeRun(db, run.id, "passed");

    const { prepareRelease, approveRelease } = await import("../../lib/repositories/releases");
    const { createDeployment, claimDeploymentById } = await import("../../lib/repositories/deployments");
    const { runDeploymentJob } = await import("../../lib/deployment/pipeline");

    const release = await prepareRelease(db, ownerActor, app.id, { specificationVersionId: build.specificationVersionId });
    await approveRelease(db, ownerActor, app.id, release.id);
    const deployment = await createDeployment(db, ownerActor, app.id, { releaseId: release.id, idempotencyKey: `e2e-seed-m11-${suffix}-${RUN_ID}-deploy` });
    const claimed = await claimDeploymentById(db, deployment.id, "e2e-seed-worker", 120_000);
    if (!claimed) throw new Error(`e2e setup: failed to claim the M11 fixture deployment for app ${app.id}`);
    const outcome = await runDeploymentJob(
      {
        db,
        workerId: "e2e-seed-worker",
        leaseDurationMs: 120_000,
        signal: new AbortController().signal,
        verifyProductionRoute: async (host) => {
          try {
            const res = await fetch(appbuilderBaseUrl, { headers: { Host: host } });
            return { ok: res.status < 500, status: res.status, message: "e2e-seed verification" };
          } catch (err) {
            return { ok: false, message: err instanceof Error ? err.message : "e2e-seed verification failed" };
          }
        },
      },
      claimed,
    );
    if (outcome.kind !== "completed" || outcome.deployment.status !== "succeeded") {
      throw new Error(`e2e setup: M11 fixture deployment for app ${app.id} did not succeed (${JSON.stringify(outcome)})`);
    }

    // Bootstrap the owner as a real PRODUCTION generated-app member (never
    // done by resetGeneratedData, which is preview-only by construction) so
    // an authenticated owner session can actually view the deployed app's
    // dashboard — mirrors what a real deployed app's first admin would need,
    // done here directly since M11 has no production-membership-bootstrap UI
    // of its own yet.
    await db.insert(schema.generatedAppMembers).values({
      id: generateId(),
      appId: app.id,
      environment: "production",
      principalId: owner.id,
      roleIds: ["admin"],
      status: "active",
      provenance: "owner_bootstrap",
      invitedByPrincipalId: null,
    });

    return { app, release, productionHost: release.productionHost };
  }

  // A third M11 fixture: eligible (a real passing validation run) but never
  // released — lets a spec drive the full prepare → approve → deploy → roll
  // back UI flow itself, from a clean starting state.
  async function seedM11ReadyToDeployApp(suffix: string) {
    const app = await createApp(
      db,
      ownerActor,
      {
        name: `M11 Ready App ${suffix}`,
        slug: `e2e-m11-ready-${suffix}-${RUN_ID}`,
        description: "E2E fixture — eligible for release but not yet deployed.",
        starterFamily: "task_management",
        visibility: "private",
      },
      `e2e-seed-m11-ready-${suffix}-${RUN_ID}`,
    );
    const template = getTemplate("task_management");
    if (!template) throw new Error("task_management template is not registered in @asafarim/appbuilder-runtime");
    await applyTemplateVersion(db, ownerActor, app.id, { template, baseVersionNumber: 1, idempotencyKey: `e2e-seed-m11-ready-${suffix}-${RUN_ID}-template` });
    await requestPreviewBuild(db, ownerActor, app.id);

    const { enqueueValidationRun, transitionStatus, upsertGateResult, finalizeRun } = await import("../../lib/repositories/validationRuns");
    const run = await enqueueValidationRun(db, ownerActor, app.id, { idempotencyKey: `e2e-seed-m11-ready-${suffix}-${RUN_ID}-run`, requestSource: "manual" });
    await transitionStatus(db, run.id, "pending", "running");
    await upsertGateResult(db, {
      runId: run.id,
      appId: app.id,
      gateKey: "spec_schema_validity",
      gateVersion: "1.0.0",
      mandatory: true,
      result: { status: "passed" },
      startedAt: new Date(),
      completedAt: new Date(),
      artifactIds: [],
    });
    await finalizeRun(db, run.id, "passed");
    return app;
  }

  const m11ReadyToDeployApp = await seedM11ReadyToDeployApp("ready");

  const m11DeployedApp = await seedM11DeployedApp("deployed");

  // A second, independently deployed app whose DRAFT is then edited after
  // deployment — proves "draft edits never affect production" has something
  // real to assert against (production keeps serving the version it was
  // deployed with even though the draft has since moved on).
  const m11DraftDivergedApp = await seedM11DeployedApp("draft-diverged");
  await applyOperation(db, ownerActor, m11DraftDivergedApp.app.id, {
    operation: { opVersion: "1.0.0", type: "CREATE_ENTITY", entity: { id: "post_deploy_entity", machineName: "post_deploy_entity", name: "Post Deploy Entity" } },
    baseVersionNumber: 2, // v1 root, v2 = the applied template (what's live in production)
    idempotencyKey: `e2e-seed-m11-draft-diverged-${RUN_ID}-edit`,
  });

  const m10NarrowApp = await seedM09App("m10-narrow");
  // A permission gap whose failure message contains "narrow" — the fake
  // repair provider routes any diagnostics text containing that marker to
  // REPAIR_NARROW_PERMISSION_SCRIPT (a DESTRUCTIVE proposal), exercising the
  // repair-confirmation flow independently of whether the proposed fix
  // would actually resolve THIS gap (it doesn't have to — this fixture only
  // proves the confirm/cancel UI and API path work). The "dashboard"/
  // "projects"/"tasks" pages have no `requiredRoleIds` (open to every role —
  // see taskManagement.ts), so merely adding a new role already creates an
  // unresolved read-permission gap on "project"/"task" for it — no
  // additional operation needed.
  await applyOperation(db, ownerActor, m10NarrowApp.id, {
    operation: { opVersion: "1.0.0", type: "CREATE_ROLE", role: { id: "narrow_role", name: "Narrow Role" } },
    baseVersionNumber: 2, // v1 root, v2 = the applied template
    idempotencyKey: `e2e-seed-m10-narrow-role-${RUN_ID}`,
  });
  await requestPreviewBuild(db, ownerActor, m10NarrowApp.id);

  await fs.writeFile(
    path.join(AUTH_DIR, "fixtures.json"),
    JSON.stringify(
      {
        demoAppId: demoApp.id,
        archivedAppId: archivedApp.id,
        noPreviewAppId: noPreviewApp.id,
        securityAppId: securityApp.id,
        builderAppId: builderApp.id,
        builderAppPriorityId: builderAppPriority.id,
        builderAppSelectionId: builderAppSelection.id,
        builderAppDestructiveId: builderAppDestructive.id,
        builderAppHistoryId: builderAppHistory.id,
        builderAppAdversarialId: builderAppAdversarial.id,
        builderAppA11yDialogId: builderAppA11yDialog.id,
        builderAppA11yMotionId: builderAppA11yMotion.id,
        m09AppId: m09App.id,
        m09AppSecondaryId: m09AppSecondary.id,
        m10PassingAppId: m10PassingApp.id,
        m10BrokenAppId: m10BrokenApp.id,
        m10NarrowAppId: m10NarrowApp.id,
        m11ReadyToDeployAppId: m11ReadyToDeployApp.id,
        m11DeployedAppId: m11DeployedApp.app.id,
        m11DeployedAppProductionHost: m11DeployedApp.productionHost,
        m11DraftDivergedAppId: m11DraftDivergedApp.app.id,
        m11DraftDivergedAppProductionHost: m11DraftDivergedApp.productionHost,
        ownerId: owner.id,
        editorId: editor.id,
        viewerId: viewer.id,
        unrelatedId: unrelated.id,
      },
      null,
      2,
    ),
  );

  const roleUsers: Array<["owner" | "editor" | "viewer" | "unrelated", typeof owner]> = [
    ["owner", owner],
    ["editor", editor],
    ["viewer", viewer],
    ["unrelated", unrelated],
  ];
  for (const [role, user] of roleUsers) {
    const state = await buildStorageState({
      id: user.id,
      username: user.username ?? role,
      name: user.name ?? role,
      email: user.email,
    });
    await fs.writeFile(path.join(AUTH_DIR, `${role}.json`), JSON.stringify(state, null, 2));
  }

  // Warm up the preview route before the suite starts: Next.js dev mode
  // (Turbopack) compiles each route lazily on first hit, which can take
  // several seconds — long enough to flake a test's `expect` timeout. A
  // production build has no such delay; this exists only so the suite is
  // reliable against `next dev`.
  const ownerCookie = await buildStorageState({
    id: owner.id,
    username: owner.username ?? "owner",
    name: owner.name ?? "owner",
    email: owner.email,
  });
  const appbuilderUrl = process.env.NEXT_PUBLIC_APPBUILDER_URL || "http://localhost:3006";
  const warmUpCookieHeader = `authjs.session-token=${ownerCookie.cookies[0].value}`;
  // M07's ai-generation.spec.ts hits /apps/new and /apps/[appId] first —
  // warm those too, same rationale as the preview route above. M11 adds its
  // own brand-new API routes (releases/deployments) and the managed-app
  // render route — each needs its own first-hit compile paid for here too,
  // not by m11-releases-deployment.spec.ts's own assertions.
  for (const path of [
    `/apps/${demoApp.id}/preview`,
    "/apps/new",
    `/apps/${demoApp.id}`,
    `/apps/${m11ReadyToDeployApp.id}`,
    `/api/apps/${m11ReadyToDeployApp.id}/releases`,
    `/api/apps/${m11ReadyToDeployApp.id}/deployments`,
  ]) {
    try {
      await fetch(`${appbuilderUrl}${path}`, { headers: { Cookie: warmUpCookieHeader } });
    } catch {
      // Best-effort — a failed warm-up just means the first real test pays
      // the compile cost instead; it doesn't affect correctness.
    }
  }
  // The managed-app route resolves by HOST, not path — warm it via its own
  // host header rather than the builder's own origin/path.
  try {
    await fetch(appbuilderUrl, { headers: { Cookie: warmUpCookieHeader, Host: m11DeployedApp.productionHost } });
  } catch {
    // Best-effort, see above.
  }

  await closeDb();
  await prisma.$disconnect();
}
