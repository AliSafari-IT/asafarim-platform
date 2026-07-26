import { resetGeneratedData } from "../../generated-data/seed";
import { launchSmokeHarness, SmokeHarnessUnavailableError, livePreviewUrl } from "../smoke/harness";
import { matchesTaskManagementFixture } from "./taskManagementShape";
import type { GateContext, GateDefinition, GateResult } from "../types";
import { redactFailures } from "../redaction";

/**
 * Role-based denial journeys via builder role-simulation
 * (`?simulateRoleId=`, the same sanctioned mechanism
 * `tests/e2e/specs/m09-generated-data.spec.ts` uses) — proves UI hiding is
 * never the only control: a page hidden from `employee_role`'s nav is ALSO
 * denied by direct URL, and an action button absent from the UI is ALSO
 * rejected server-side (403 `runtime_permission_denied`) when called
 * directly against the runtime API. Same task_management-fixture scope
 * boundary as crudSmoke.ts.
 */
export const roleDenialJourneysGate: GateDefinition = {
  key: "role_denial_journeys",
  version: "1.0.0",
  mandatory: true,
  title: "Role-based denial journeys",
  description: "A role without a page/action's required permission is denied both in navigation/UI and server-side at the runtime API, never just hidden.",
  async execute(ctx: GateContext): Promise<GateResult> {
    if (!matchesTaskManagementFixture(ctx.specPayload)) {
      return { status: "skipped", skipReason: "Role-denial journeys are only implemented for the task-management fixture shape; this specification does not match it." };
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

    try {
      // Page-level denial: employee_role has no access to "team"/"settings".
      for (const path of ["team", "settings"]) {
        await harness.page.goto(livePreviewUrl(harness.baseUrl, ctx.appId, [path], { simulateRoleId: "employee_role" }), { waitUntil: "domcontentloaded", timeout: 20_000 });
        const denied = await harness.page.getByText(/don.t have access to this page/i).isVisible({ timeout: 10_000 }).catch(() => false);
        if (!denied) failures.push({ code: "page_denial_missing", message: `employee_role was not denied access to the "${path}" page.` });
      }

      // Nav-level hiding matches the server-side denial (not contradicting it).
      await harness.page.goto(livePreviewUrl(harness.baseUrl, ctx.appId, [], { simulateRoleId: "employee_role" }), { waitUntil: "domcontentloaded", timeout: 20_000 });
      const teamLink = await harness.page.getByRole("link", { name: "Team", exact: true }).count();
      if (teamLink > 0) failures.push({ code: "nav_leak", message: "employee_role's nav still shows a link to the Team page it cannot access." });

      // API-level denial: employee_role has no project:create permission.
      const denied = await harness.page.request.post(`${harness.baseUrl}/api/apps/${ctx.appId}/runtime/entities/project/records?simulateRoleId=employee_role`, {
        data: { data: { name: "Should not be created by role-denial gate", status: "planning" } },
      });
      if (denied.status() !== 403) {
        failures.push({ code: "api_denial_missing", message: `Expected 403 creating a project as employee_role; got ${denied.status()}.` });
      }

      // Manager: create allowed, delete denied — proves this isn't a
      // blanket "employee_role only" check but a real per-role permission
      // evaluation.
      const managerCreate = await harness.page.request.post(`${harness.baseUrl}/api/apps/${ctx.appId}/runtime/entities/project/records?simulateRoleId=manager`, {
        data: { data: { name: "M10 Validation Manager Project", status: "planning" } },
      });
      if (managerCreate.status() === 201) {
        const { record } = await managerCreate.json();
        const managerArchive = await harness.page.request.post(`${harness.baseUrl}/api/apps/${ctx.appId}/runtime/entities/project/records/${record.id}/archive?simulateRoleId=manager`);
        if (managerArchive.status() !== 403) {
          failures.push({ code: "manager_delete_not_denied", message: `Expected 403 archiving a project as manager (no delete permission); got ${managerArchive.status()}.` });
        }
      } else {
        failures.push({ code: "manager_create_denied_unexpectedly", message: `Expected 201 creating a project as manager; got ${managerCreate.status()}.` });
      }

      if (failures.length > 0) {
        return {
          status: "failed",
          failureCode: "role_denial_not_enforced",
          failureMessage: `${failures.length} role-denial assertion(s) failed.`,
          structuredFailures: redactFailures(failures),
        };
      }
      return { status: "passed", evidence: { rolesChecked: ["employee_role", "manager"] } };
    } finally {
      await harness.close();
    }
  },
};
