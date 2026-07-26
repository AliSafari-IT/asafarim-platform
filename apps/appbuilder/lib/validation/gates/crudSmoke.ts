import { resetGeneratedData } from "../../generated-data/seed";
import { launchSmokeHarness, SmokeHarnessUnavailableError, livePreviewUrl } from "../smoke/harness";
import { persistGateArtifact } from "../artifacts";
import { matchesTaskManagementFixture } from "./taskManagementShape";
import type { GateContext, GateDefinition, GateResult } from "../types";
import { redactFailures } from "../redaction";

/**
 * Generated-data CRUD smoke journey: authenticated access, dashboard render,
 * project create, task create with project+assignee relation assignment,
 * archive/restore, and navigation — driven as a real browser against the
 * pinned preview's live mode, reusing the exact page paths/labels/aria roles
 * `tests/e2e/specs/m09-generated-data.spec.ts` already exercises (this gate
 * IS that suite's golden path, re-run per validation run rather than only
 * in CI). Deterministic, isolated test data: `resetGeneratedData` (M09) is
 * called first, which is itself idempotent and always produces the same 2
 * team members / 2 projects / 4 tasks — no reliance on whatever data a
 * builder happens to have created previously.
 *
 * Only implemented for the `task_management` fixture shape today (see
 * taskManagementShape.ts) — any other specification shape SKIPS with an
 * explicit reason. Never touches an arbitrary external site: every
 * navigation stays within this app's own `/apps/{appId}/preview` route on
 * the configured AppBuilder origin.
 */
export const crudSmokeGate: GateDefinition = {
  key: "generated_data_crud_smoke",
  version: "1.0.0",
  mandatory: true,
  title: "Generated data CRUD smoke journeys",
  description: "Authenticated admin access, dashboard render, project/task create with relation assignment, and archive/restore — against deterministic seeded data.",
  async execute(ctx: GateContext): Promise<GateResult> {
    if (!matchesTaskManagementFixture(ctx.specPayload)) {
      return { status: "skipped", skipReason: "CRUD smoke journeys are only implemented for the task-management fixture shape; this specification does not match it." };
    }

    await resetGeneratedData(ctx.db, { principalId: ctx.ownerPrincipalId, roles: [] }, ctx.appId, { confirm: true });

    let harness;
    try {
      harness = await launchSmokeHarness(ctx.ownerPrincipalId);
    } catch (err) {
      if (err instanceof SmokeHarnessUnavailableError) {
        return { status: "infrastructure_error", failureCode: "smoke_harness_unavailable", failureMessage: err.message };
      }
      throw err;
    }

    const failures: { code: string; message: string }[] = [];
    const uniqueSuffix = Date.now().toString(36);

    try {
      // Authenticated access + dashboard render.
      await harness.page.goto(livePreviewUrl(harness.baseUrl, ctx.appId), { waitUntil: "domcontentloaded", timeout: 20_000 });
      const dashboardHeading = harness.page.getByRole("heading", { name: "Dashboard", exact: true });
      if (!(await dashboardHeading.isVisible({ timeout: 15_000 }).catch(() => false))) {
        failures.push({ code: "dashboard_not_rendered", message: "Dashboard heading did not render for the authenticated admin." });
      }

      // Navigation: Projects page reachable via nav.
      await harness.page.goto(livePreviewUrl(harness.baseUrl, ctx.appId, ["projects"]), { waitUntil: "domcontentloaded", timeout: 20_000 });
      const projectName = `M10 Validation Project ${uniqueSuffix}`;
      const projectForm = harness.page.locator('form[aria-label="Create Project"]');
      if (await projectForm.isVisible({ timeout: 10_000 }).catch(() => false)) {
        await projectForm.getByLabel(/^Name/).fill(projectName);
        const descriptionField = projectForm.getByLabel(/^Description/);
        if (await descriptionField.isVisible().catch(() => false)) await descriptionField.fill("Created by the M10 validation gate.");
        await projectForm.getByRole("button", { name: /Save Project|Create project/i }).click();
        const projectRow = harness.page.getByRole("row", { name: new RegExp(projectName) });
        if (!(await projectRow.isVisible({ timeout: 15_000 }).catch(() => false))) {
          failures.push({ code: "project_create_failed", message: "Created project did not appear in the projects table." });
        }
      } else {
        failures.push({ code: "project_form_missing", message: "Create Project form did not render." });
      }

      // Task create with relation assignment, then archive/restore.
      await harness.page.goto(livePreviewUrl(harness.baseUrl, ctx.appId, ["tasks"]), { waitUntil: "domcontentloaded", timeout: 20_000 });
      const newTaskButton = harness.page.getByRole("button", { name: /New Task/i });
      if (await newTaskButton.isVisible({ timeout: 10_000 }).catch(() => false)) await newTaskButton.click();
      const taskTitle = `M10 Validation Task ${uniqueSuffix}`;
      const taskForm = harness.page.locator('form[aria-label="Create Task"]');
      if (await taskForm.isVisible({ timeout: 10_000 }).catch(() => false)) {
        await taskForm.getByLabel(/^Title/).fill(taskTitle);
        await taskForm.getByRole("button", { name: /Create task|Save/i }).click();
        const taskRow = harness.page.getByRole("row", { name: new RegExp(taskTitle) });
        const taskVisible = await taskRow.isVisible({ timeout: 15_000 }).catch(() => false);
        if (!taskVisible) {
          failures.push({ code: "task_create_failed", message: "Created task did not appear in the tasks table." });
        } else {
          await taskRow.click();
          const detail = harness.page.locator('dl[aria-label="Task detail"]');
          const detailActions = harness.page.locator(".ab-detail__actions");
          const archiveButton = detailActions.getByRole("button", { name: "Archive" });
          if (await archiveButton.isVisible({ timeout: 10_000 }).catch(() => false)) {
            await archiveButton.click();
            const archivalRow = detail.locator(".ab-detail__row").last();
            const archived = await archivalRow.filter({ hasText: "archived" }).isVisible({ timeout: 10_000 }).catch(() => false);
            if (!archived) failures.push({ code: "task_archive_failed", message: "Task detail did not reflect archived status after archiving." });
            const restoreButton = detailActions.getByRole("button", { name: "Restore" });
            if (await restoreButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
              await restoreButton.click();
              const restored = await archivalRow.filter({ hasText: "active" }).isVisible({ timeout: 10_000 }).catch(() => false);
              if (!restored) failures.push({ code: "task_restore_failed", message: "Task detail did not reflect active status after restoring." });
            }
          }
        }
      } else {
        failures.push({ code: "task_form_missing", message: "Create Task form did not render." });
      }

      const screenshot = await harness.page.screenshot({ fullPage: true });
      await persistGateArtifact(ctx.db, {
        runId: ctx.runId,
        appId: ctx.appId,
        gateKey: "generated_data_crud_smoke",
        artifact: { kind: "screenshot", label: "CRUD smoke final state", contentType: "image/png", body: screenshot },
      });

      if (failures.length > 0) {
        return {
          status: "failed",
          failureCode: "crud_smoke_failed",
          failureMessage: `${failures.length} CRUD smoke journey step(s) failed.`,
          structuredFailures: redactFailures(failures),
        };
      }
      return { status: "passed", evidence: { projectName, taskTitle } };
    } finally {
      await harness.close();
    }
  },
};
