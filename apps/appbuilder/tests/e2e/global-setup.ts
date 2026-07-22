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
  const { REGISTRY_VERSION } = await import("@asafarim/appbuilder-runtime");
  const { getDb, closeDb } = await import("../../lib/db/client");
  const { generateId } = await import("../../lib/db/ids");
  const schema = await import("../../lib/db/schema");
  const { archiveApp, createApp } = await import("../../lib/repositories/apps");
  const { addCollaborator } = await import("../../lib/repositories/collaborators");
  const { requestPreviewBuild } = await import("../../lib/repositories/previewService");
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

  await fs.writeFile(
    path.join(AUTH_DIR, "fixtures.json"),
    JSON.stringify(
      {
        demoAppId: demoApp.id,
        archivedAppId: archivedApp.id,
        noPreviewAppId: noPreviewApp.id,
        securityAppId: securityApp.id,
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
