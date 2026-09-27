import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { functionalRequirements, projects, testCases, testFixtures, testSuites } from "@/db/schema";
import { planWorkbenchImport, validateWorkbenchFile, type WorkbenchFailure } from "@/lib/workbench-import";

export type ConfirmResult = { ok: true; status: "created" | "already_imported"; frId: string; projectId: string; cases: number } | WorkbenchFailure;

/**
 * Creates the requirement, suite, fixture, and pending scenarios for an AI
 * Workbench handoff (#678) in one transaction. Re-validates the file (the
 * preview is never trusted). Idempotent: ids derive from the handoff id, so
 * a second confirm — or a concurrent one losing the insert race — reports
 * the records the first created. Who imported what, from which tool and
 * version, and when is kept on the requirement's metadata.
 */
export async function confirmWorkbenchImport(text: string, projectId: string, importedBy: string): Promise<ConfirmResult> {
  const checked = validateWorkbenchFile(text);
  if (!checked.ok) return checked;
  const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
  if (!project) return { ok: false, code: "unknown_app", message: "Choose an app that exists in Testora; nothing was imported." };

  const plan = planWorkbenchImport(checked.envelope, projectId, importedBy);
  const existing = await db.query.functionalRequirements.findFirst({ where: eq(functionalRequirements.id, plan.ids.frId) });
  if (existing) return { ok: true, status: "already_imported", frId: existing.id, projectId: existing.projectId, cases: plan.cases.length };

  try {
    await db.transaction(async (tx) => {
      await tx.insert(functionalRequirements).values(plan.requirement);
      await tx.insert(testSuites).values(plan.suite);
      await tx.insert(testFixtures).values(plan.fixture);
      if (plan.cases.length) await tx.insert(testCases).values(plan.cases);
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: true, status: "already_imported", frId: plan.ids.frId, projectId, cases: plan.cases.length };
    throw error;
  }
  return { ok: true, status: "created", frId: plan.ids.frId, projectId, cases: plan.cases.length };
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code: string }).code === "23505");
}
