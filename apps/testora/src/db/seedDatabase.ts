import { db } from "@/db/client";
import { and, eq, notInArray } from "drizzle-orm";
import {
  functionalRequirements,
  testSuites,
  testFixtures,
  testCases,
  targetEnvironments,
  projects,
} from "@/db/schema";
import type {
  FunctionalRequirementDefinition,
  TestSuiteDefinition,
  TestFixtureDefinition,
  TestCaseDefinition,
} from "@/test-engine/types";
import { DEFAULT_PROJECT_ID, PROJECTS, projectSeedTargets } from "@/data/projects";
import {
  asafarimPortalAuthFR,
  asafarimPortalSuites,
  asafarimPortalFixtures,
  asafarimPortalCases,
} from "@/data/asafarim/portal-auth";
import {
  portalAdminFR,
  portalAdminSuites,
  portalAdminFixtures,
  portalAdminCases,
} from "@/data/asafarim/portal-admin";
import {
  edumatchFR,
  edumatchSuites,
  edumatchFixtures,
  edumatchCases,
} from "@/data/asafarim/edumatch";
import {
  viontoFR,
  viontoSuites,
  viontoFixtures,
  viontoCases,
} from "@/data/asafarim/vionto";
import {
  timelineaiFR,
  timelineaiSuites,
  timelineaiFixtures,
  timelineaiCases,
} from "@/data/asafarim/timelineai";

interface SeedBundle {
  fr: FunctionalRequirementDefinition;
  suites: TestSuiteDefinition[];
  fixtures: TestFixtureDefinition[];
  cases: TestCaseDefinition[];
  /** App this bundle belongs to; defaults to {@link DEFAULT_PROJECT_ID}. */
  projectId?: string;
}

const baseBundles: SeedBundle[] = [
  // ── ASafariM apps (projectId: "asafarim-*") ────────────────────────────────
  {
    fr: timelineaiFR,
    suites: timelineaiSuites,
    fixtures: timelineaiFixtures,
    cases: timelineaiCases,
    projectId: "asafarim-timelineai",
  },
  {
    fr: asafarimPortalAuthFR,
    suites: asafarimPortalSuites,
    fixtures: asafarimPortalFixtures,
    cases: asafarimPortalCases,
    projectId: "asafarim-portal",
  },
  {
    fr: portalAdminFR,
    suites: portalAdminSuites,
    fixtures: portalAdminFixtures,
    cases: portalAdminCases,
    projectId: "asafarim-portal",
  },
  {
    fr: edumatchFR,
    suites: edumatchSuites,
    fixtures: edumatchFixtures,
    cases: edumatchCases,
    projectId: "asafarim-edumatch",
  },
  {
    fr: viontoFR,
    suites: viontoSuites,
    fixtures: viontoFixtures,
    cases: viontoCases,
    projectId: "asafarim-vionto",
  },
];

const bundles: SeedBundle[] = baseBundles;

export interface SeedSummary {
  title: string;
  suites: number;
  fixtures: number;
  cases: number;
}

export interface SeedResult {
  requirements: number;
  suites: number;
  fixtures: number;
  cases: number;
  // Catalog entries removed because they're no longer defined in code (FKs
  // cascade, so their child rows + stored results go too).
  prunedFixtures: number;
  prunedCases: number;
  perRequirement: SeedSummary[];
}

/** Every id the current code catalog defines, per level. */
function codeCatalogIds() {
  return {
    frIds: bundles.map((b) => b.fr.id),
    suiteIds: bundles.flatMap((b) => b.suites.map((s) => s.suiteId)),
    fixtureIds: bundles.flatMap((b) => b.fixtures.map((f) => f.fixtureId)),
    caseIds: bundles.flatMap((b) => b.cases.map((c) => c.caseId)),
  };
}

/**
 * Catalog rows present in the DB but no longer defined in code — a dry run of
 * what {@link seedDatabase} would prune. Useful before re-seeding.
 */
export async function findOrphans() {
  const { fixtureIds, caseIds } = codeCatalogIds();
  const orphanFixtures = fixtureIds.length
    ? await db
        .select({ id: testFixtures.fixtureId, title: testFixtures.title })
        .from(testFixtures)
        .where(notInArray(testFixtures.fixtureId, fixtureIds))
    : [];
  const orphanCases = caseIds.length
    ? await db
        .select({ id: testCases.caseId, fixtureId: testCases.fixtureId })
        .from(testCases)
        .where(notInArray(testCases.caseId, caseIds))
    : [];
  return { orphanFixtures, orphanCases };
}

/**
 * Reconcile the built-in target environments for every app with their code
 * definitions (see projectSeedTargets). Seeded rows are upserted in their defined
 * order; seeded rows no longer in code are pruned. User-added targets
 * (seeded = false) are never touched. Updating a built-in's URL preserves any
 * other fields and just refreshes name/URLs/order.
 */
async function seedTargetEnvironments(): Promise<void> {
  const seededIds: string[] = [];
  for (const project of PROJECTS) {
    const targets = projectSeedTargets(project);
    for (let index = 0; index < targets.length; index++) {
      const target = targets[index]!;
      const id = `${project.id}:${target.slug}`;
      seededIds.push(id);
      const row = {
        id,
        projectId: project.id,
        name: target.name,
        baseUrl: target.baseUrl,
        apiUrl: target.apiUrl,
        seeded: true,
        sortOrder: index,
        updatedAt: new Date(),
      };
      await db
        .insert(targetEnvironments)
        .values(row)
        .onConflictDoUpdate({
          target: targetEnvironments.id,
          set: {
            projectId: row.projectId,
            name: row.name,
            baseUrl: row.baseUrl,
            apiUrl: row.apiUrl,
            seeded: true,
            sortOrder: row.sortOrder,
            updatedAt: row.updatedAt,
          },
        });
    }
  }
  // Drop only built-in targets that code no longer defines; keep user-added ones.
  if (seededIds.length) {
    await db
      .delete(targetEnvironments)
      .where(and(eq(targetEnvironments.seeded, true), notInArray(targetEnvironments.id, seededIds)));
  }
}

/**
 * Reconcile the test catalog with the `@/data` definitions: existing rows are
 * updated, new ones inserted, and entries no longer defined in code are PRUNED
 * (their cases + stored results cascade away). The code is the source of truth,
 * so removing a test from code and re-seeding cleans up its stale rows. Backs
 * both `pnpm db:seed` and the "Update tests" button on the Run page.
 *
 * Note: tests created ad-hoc via the UI forms (not present in code) are also
 * pruned — the catalog is code-driven.
 */
/**
 * Mirror the code-defined apps into the `projects` table. Names/URLs/branding are
 * reconciled from code, but a project's `visibility` and `keyHash` are PRESERVED
 * on conflict — so marking a seeded app private in the UI survives a re-seed.
 * Seeded projects are reconciled with the code registry. A seeded project removed
 * from the registry is deleted so retired apps do not remain visible or retain
 * stale catalog data; user-created projects (`seeded = false`) are untouched.
 */
async function seedProjects(): Promise<void> {
  for (const project of PROJECTS) {
    await db
      .insert(projects)
      .values({
        id: project.id,
        name: project.name,
        baseUrl: project.baseUrl ?? "",
        apiUrl: project.apiUrl ?? "",
        productName: project.brand?.productName ?? null,
        companyName: project.brand?.companyName ?? null,
        seeded: true,
        // New seeded rows default to public; private must be opted into in the UI.
        visibility: "public",
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: projects.id,
        set: {
          name: project.name,
          baseUrl: project.baseUrl ?? "",
          apiUrl: project.apiUrl ?? "",
          productName: project.brand?.productName ?? null,
          companyName: project.brand?.companyName ?? null,
          seeded: true,
          updatedAt: new Date(),
          // NB: visibility + keyHash intentionally omitted — preserve user choice.
        },
      });
  }

  const currentProjectIds = PROJECTS.map((project) => project.id);
  if (currentProjectIds.length) {
    await db
      .delete(projects)
      .where(
        and(
          eq(projects.seeded, true),
          notInArray(projects.id, currentProjectIds),
        ),
      );
  }
}

export async function seedDatabase(): Promise<SeedResult> {
  const perRequirement: SeedSummary[] = [];

  await seedProjects();

  for (const bundle of bundles) {
    const frRow = {
      ...bundle.fr,
      projectId: bundle.projectId ?? bundle.fr.projectId ?? DEFAULT_PROJECT_ID,
    };
    await db
      .insert(functionalRequirements)
      .values(frRow)
      .onConflictDoUpdate({ target: functionalRequirements.id, set: frRow });

    for (const suite of bundle.suites) {
      await db
        .insert(testSuites)
        .values(suite)
        .onConflictDoUpdate({ target: testSuites.suiteId, set: suite });
    }

    for (const fixture of bundle.fixtures) {
      await db
        .insert(testFixtures)
        .values(fixture)
        .onConflictDoUpdate({ target: testFixtures.fixtureId, set: fixture });
    }

    for (const testCase of bundle.cases) {
      await db
        .insert(testCases)
        .values(testCase)
        .onConflictDoUpdate({ target: testCases.caseId, set: testCase });
    }

    perRequirement.push({
      title: bundle.fr.title,
      suites: bundle.suites.length,
      fixtures: bundle.fixtures.length,
      cases: bundle.cases.length,
    });
  }

  // Prune anything no longer in code (cases under kept fixtures, then whole
  // removed fixtures/suites/requirements). FK cascades clean up descendants and
  // stored results. Guarded so an unexpectedly-empty catalog can't wipe the DB.
  const { frIds, suiteIds, fixtureIds, caseIds } = codeCatalogIds();
  let prunedCases = 0;
  let prunedFixtures = 0;
  if (caseIds.length) {
    prunedCases = (
      await db
        .delete(testCases)
        .where(notInArray(testCases.caseId, caseIds))
        .returning({ id: testCases.caseId })
    ).length;
  }
  if (fixtureIds.length) {
    prunedFixtures = (
      await db
        .delete(testFixtures)
        .where(notInArray(testFixtures.fixtureId, fixtureIds))
        .returning({ id: testFixtures.fixtureId })
    ).length;
  }
  if (suiteIds.length) {
    await db.delete(testSuites).where(notInArray(testSuites.suiteId, suiteIds));
  }
  if (frIds.length) {
    await db
      .delete(functionalRequirements)
      .where(notInArray(functionalRequirements.id, frIds));
  }

  await seedTargetEnvironments();

  return {
    requirements: perRequirement.length,
    suites: perRequirement.reduce((total, item) => total + item.suites, 0),
    fixtures: perRequirement.reduce((total, item) => total + item.fixtures, 0),
    cases: perRequirement.reduce((total, item) => total + item.cases, 0),
    prunedFixtures,
    prunedCases,
    perRequirement,
  };
}
