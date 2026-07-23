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
  // warm those too, same rationale as the preview route above.
  for (const path of [`/apps/${demoApp.id}/preview`, "/apps/new", `/apps/${demoApp.id}`]) {
    try {
      await fetch(`${appbuilderUrl}${path}`, { headers: { Cookie: warmUpCookieHeader } });
    } catch {
      // Best-effort — a failed warm-up just means the first real test pays
      // the compile cost instead; it doesn't affect correctness.
    }
  }

  await closeDb();
  await prisma.$disconnect();
}
