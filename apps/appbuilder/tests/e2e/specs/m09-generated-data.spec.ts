import { test, expect, type Page } from "@playwright/test";
import { authedContext, loadFixtures } from "../fixtures/testContext";

/**
 * M09 "live" generated-data engine — end-to-end coverage of the real,
 * persisted runtime reachable at `/apps/{appId}/preview[/...path]` in
 * builder-live-mode (`?mode=live`) and builder-role-simulation
 * (`?simulateRoleId=...`) — see
 * app/apps/[appId]/preview/[[...path]]/page.tsx's module docstring for the
 * full route-selection contract this suite exercises.
 *
 * Uses the dedicated `m09App`/`m09AppSecondary` fixtures (see
 * tests/e2e/global-setup.ts#seedM09App) — the UNMODIFIED
 * `task_management` template from `@asafarim/appbuilder-runtime`, pre-seeded
 * via the real `resetGeneratedData` path (2 team members, 2 projects, 4
 * tasks — see lib/generated-data/seed.ts) with the app's OWNER already
 * bootstrapped as a real generated-app "admin" member. This means the
 * "owner" Playwright session doubles as a genuine (non-simulated)
 * generated-app admin for every test below; manager/employee_role
 * assertions use `?simulateRoleId=` on that same owner session (only an
 * actor with real builder `app.viewPreview` capability may simulate — see
 * routeHelpers.ts).
 *
 * Tests run in declaration order against the SAME shared `m09App` fixture
 * (the suite is not parallel — see playwright.config.ts's `workers: 1`) —
 * the dashboard-counts test deliberately runs first, before any test
 * mutates data, and every later test creates its own distinctly-titled
 * records rather than reusing another test's.
 */
test.describe.configure({ timeout: 60_000 });

const fixtures = loadFixtures();

/** Builds a preview URL in either builder-live-mode or builder-role-simulation — never both at once (simulateRoleId takes priority server-side regardless, but this keeps each call's intent unambiguous). */
function liveUrl(appId: string, path: string, opts: { simulateRoleId?: string } = {}): string {
  const params = new URLSearchParams();
  if (opts.simulateRoleId) params.set("simulateRoleId", opts.simulateRoleId);
  else params.set("mode", "live");
  return `/apps/${appId}/preview${path ? `/${path}` : ""}?${params.toString()}`;
}

async function createRecordViaApi(page: Page, appId: string, entityId: string, data: Record<string, unknown>, simulateRoleId?: string) {
  const qs = simulateRoleId ? `?simulateRoleId=${encodeURIComponent(simulateRoleId)}` : "";
  const res = await page.request.post(`/api/apps/${appId}/runtime/entities/${entityId}/records${qs}`, { data: { data } });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).record as { id: string; revision: number; status: string };
}

test("dashboard shows live metric cards and a chart reflecting the seeded counts", async ({ browser }) => {
  const context = await authedContext(browser, "owner");
  const page = await context.newPage();

  await page.goto(liveUrl(fixtures.m09AppId, ""));
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  // Real generated-app admin (owner_bootstrap), not simulated, not the
  // automatic-end-user branch — "Live preview" is the badge that branch of
  // page.tsx's `renderLiveOrAccessDenied` renders (see LiveShell.tsx).
  await expect(page.getByText("Live preview", { exact: true })).toBeVisible();

  const projectsWidget = page.locator(".ui-metric", { hasText: "Project" });
  await expect(projectsWidget.locator(".ui-metric__value")).toHaveText("2", { timeout: 15_000 });

  // NOTE: widget_open_tasks is configured with `filter: "open"`, but
  // getDashboardCounts (lib/generated-data/query.ts) ignores any filter and
  // returns the entity's total active count — so this shows all 4 seeded
  // tasks, not just the non-done ones. See this file's final report for the
  // suspected production gap.
  const tasksWidget = page.locator(".ui-metric", { hasText: "Task" });
  await expect(tasksWidget.locator(".ui-metric__value")).toHaveText("4", { timeout: 15_000 });

  const chart = page.getByRole("img", { name: /^Task by field/ });
  await expect(chart).toBeVisible({ timeout: 15_000 });
  const chartCounts = await chart.locator("table.ab-visually-hidden tbody tr td:nth-child(2)").allTextContents();
  const chartTotal = chartCounts.reduce((sum, value) => sum + Number(value), 0);
  expect(chartTotal).toBe(4);

  await context.close();
});

test("admin creates a project via the live Projects page form and sees it in the table without a full reload", async ({ browser }) => {
  const context = await authedContext(browser, "owner");
  const page = await context.newPage();

  await page.goto(liveUrl(fixtures.m09AppId, "projects"));
  await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();

  // No detailView shares the Projects page (see taskManagement.ts), so
  // EntityWorkspace shows the create form immediately — no "+ New" toggle.
  const form = page.locator('form[aria-label="Create Project"]');
  await expect(form).toBeVisible();
  await form.getByLabel(/^Name/).fill("E2E Waterfront Build");
  await form.getByLabel(/^Description/).fill("Created by the M09 e2e suite.");
  await form.getByLabel(/^Status/).selectOption({ label: "Planning" });
  await form.getByRole("button", { name: "Save Project" }).click();

  const row = page.getByRole("row", { name: /E2E Waterfront Build/ });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row.getByText("Planning")).toBeVisible();
  // Still on the same client-rendered page — LiveForm's onCreated bumps the
  // shared refresh token rather than navigating (see LivePageComponents.tsx
  // #EntityWorkspace).
  expect(new URL(page.url()).pathname).toContain("/preview/projects");

  await context.close();
});

test("admin creates a task via the Tasks page form, assigns project + assignee relations, and sees it in the table", async ({ browser }) => {
  const context = await authedContext(browser, "owner");
  const page = await context.newPage();

  await page.goto(liveUrl(fixtures.m09AppId, "tasks"));
  await expect(page.getByRole("heading", { name: "Tasks", exact: true })).toBeVisible();

  // The Tasks page groups a table + detailView + form on the same entity —
  // EntityWorkspace only auto-shows the create form when there's no
  // detailView sharing the page, so here it's behind a toggle.
  await page.getByRole("button", { name: "+ New Task" }).click();
  const form = page.locator('form[aria-label="Create Task"]');
  await expect(form).toBeVisible();

  await form.getByLabel(/^Title/).fill("E2E Kickoff Meeting");
  await form.getByLabel(/^Status/).selectOption({ label: "To do" });
  await form.getByLabel(/^Priority/).selectOption({ label: "Medium" });

  const projectSelect = form.getByLabel(/^Project/);
  await expect(projectSelect.locator("option", { hasText: "Riverside Renovation" })).toHaveCount(1, { timeout: 15_000 });
  await projectSelect.selectOption({ label: "Riverside Renovation" });

  const assigneeSelect = form.getByLabel(/^Assignee/);
  await expect(assigneeSelect.locator("option", { hasText: "Sam Rivera" })).toHaveCount(1, { timeout: 15_000 });
  await assigneeSelect.selectOption({ label: "Sam Rivera" });

  await form.getByRole("button", { name: "Create task" }).click();
  const row = page.getByRole("row", { name: /E2E Kickoff Meeting/ });
  await expect(row).toBeVisible({ timeout: 15_000 });

  // Master-detail: selecting the row shows its detail, with relation
  // fields resolved to the target record's display label — never the raw
  // record id (see LiveDetailView.tsx's RelatedRecordLabel).
  await row.click();
  const detail = page.locator('dl[aria-label="Task detail"]');
  await expect(detail).toBeVisible();
  const projectRow = detail.locator(".ab-detail__row", { hasText: "Project" });
  await expect(projectRow.locator("dd")).toHaveText("Riverside Renovation", { timeout: 15_000 });
  const assigneeRow = detail.locator(".ab-detail__row", { hasText: "Assignee" });
  await expect(assigneeRow.locator("dd")).toHaveText("Sam Rivera", { timeout: 15_000 });

  await context.close();
});

test("admin archives a task then restores it; status badges and the 'Show archived' toggle reflect both", async ({ browser }) => {
  const context = await authedContext(browser, "owner");
  const page = await context.newPage();

  const projectsRes = await page.request.get(`/api/apps/${fixtures.m09AppId}/runtime/entities/project/records?pageSize=1`);
  const { records: seededProjects } = await projectsRes.json();
  await createRecordViaApi(page, fixtures.m09AppId, "task", {
    title: "E2E Archive Target",
    status: "todo",
    priority: "low",
    project_ref: seededProjects[0].id,
  });

  await page.goto(liveUrl(fixtures.m09AppId, "tasks"));
  await page.getByLabel("Search task").fill("E2E Archive Target");
  const row = page.getByRole("row", { name: /E2E Archive Target/ });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click();

  const detail = page.locator('dl[aria-label="Task detail"]');
  await expect(detail).toBeVisible();
  // The record's own "status" field is also named "Status", so the
  // archival-status row (always appended last, see LiveDetailView.tsx) is
  // located positionally rather than by dt text.
  const archivalStatusRow = detail.locator(".ab-detail__row").last();
  await expect(archivalStatusRow).toContainText("active");

  const detailActions = page.locator(".ab-detail__actions");
  await detailActions.getByRole("button", { name: "Archive" }).click();
  await expect(archivalStatusRow).toContainText("archived");

  // Archived rows are hidden from the table by default.
  await expect(page.getByRole("row", { name: /E2E Archive Target/ })).toHaveCount(0);
  await page.getByLabel("Show archived").check();
  await expect(page.getByRole("row", { name: /E2E Archive Target/ })).toBeVisible();

  await detailActions.getByRole("button", { name: "Restore" }).click();
  await expect(archivalStatusRow).toContainText("active");

  await context.close();
});

test("a stale baseRevision on update is rejected with 409 stale_revision, never silently overwriting", async ({ browser }) => {
  const context = await authedContext(browser, "owner");
  const page = await context.newPage();

  const listRes = await page.request.get(`/api/apps/${fixtures.m09AppId}/runtime/entities/task/records?search=${encodeURIComponent("Schedule electrician")}`);
  expect(listRes.ok()).toBeTruthy();
  const { records } = await listRes.json();
  const record = records[0];
  expect(record).toBeTruthy();

  const firstUpdate = await page.request.patch(`/api/apps/${fixtures.m09AppId}/runtime/entities/task/records/${record.id}`, {
    data: { data: { status: "in_progress" }, baseRevision: record.revision },
  });
  expect(firstUpdate.status()).toBe(200);
  const { record: updated } = await firstUpdate.json();
  expect(updated.revision).toBe(record.revision + 1);

  // Retried with the now-stale original revision.
  const staleUpdate = await page.request.patch(`/api/apps/${fixtures.m09AppId}/runtime/entities/task/records/${record.id}`, {
    data: { data: { status: "done" }, baseRevision: record.revision },
  });
  expect(staleUpdate.status()).toBe(409);
  const body = await staleUpdate.json();
  expect(body.code).toBe("stale_revision");
  expect(body.currentRevision).toBe(updated.revision);
  expect(body.baseRevision).toBe(record.revision);

  await context.close();
});

test("employee_role simulation: Team/Settings hidden from nav and denied by direct URL, entity permissions enforced server-side", async ({ browser }) => {
  const context = await authedContext(browser, "owner");
  const page = await context.newPage();

  await page.goto(liveUrl(fixtures.m09AppId, "", { simulateRoleId: "employee_role" }));
  await expect(page.getByText("Viewing as: Employee (simulated)")).toBeVisible();
  await expect(page.getByRole("link", { name: "Team", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Settings", exact: true })).toHaveCount(0);

  // UI visibility is not authorization: direct navigation to a page whose
  // requiredRoleIds employee_role doesn't hold is denied server-side too,
  // never just hidden from nav.
  await page.goto(liveUrl(fixtures.m09AppId, "team", { simulateRoleId: "employee_role" }));
  await expect(page.getByText(/don.t have access to this page/i)).toBeVisible();
  await page.goto(liveUrl(fixtures.m09AppId, "settings", { simulateRoleId: "employee_role" }));
  await expect(page.getByText(/don.t have access to this page/i)).toBeVisible();

  // employee_role has no project.create permission (only
  // perm_employee_task_read/perm_employee_task_update/perm_employee_project_read
  // — see taskManagement.ts).
  const denied = await page.request.post(`/api/apps/${fixtures.m09AppId}/runtime/entities/project/records?simulateRoleId=employee_role`, {
    data: { data: { name: "Should not be created", status: "planning" } },
  });
  expect(denied.status()).toBe(403);
  expect((await denied.json()).code).toBe("runtime_permission_denied");

  // But employee_role DOES have task.update — a real update succeeds.
  const listRes = await page.request.get(
    `/api/apps/${fixtures.m09AppId}/runtime/entities/task/records?search=${encodeURIComponent("Get permit approval")}&simulateRoleId=employee_role`,
  );
  const { records } = await listRes.json();
  const target = records[0];
  const updateRes = await page.request.patch(`/api/apps/${fixtures.m09AppId}/runtime/entities/task/records/${target.id}?simulateRoleId=employee_role`, {
    data: { data: { status: "in_progress" }, baseRevision: target.revision },
  });
  expect(updateRes.status()).toBe(200);

  // No delete permission: the Archive button never renders in the detail
  // view for employee_role, even though Edit does (update is allowed).
  await page.goto(liveUrl(fixtures.m09AppId, "tasks", { simulateRoleId: "employee_role" }));
  await page.getByRole("row", { name: /Get permit approval/ }).click();
  const detailActions = page.locator(".ab-detail__actions");
  await expect(detailActions.getByRole("button", { name: "Edit" })).toBeVisible();
  await expect(detailActions.getByRole("button", { name: "Archive" })).toHaveCount(0);
  // See this file's final report: the "Show archived" toggle is gated on
  // delete, not update, so a role that can restore (update) still has no
  // UI path to reveal an archived row to select it.
  await expect(page.getByLabel("Show archived")).toHaveCount(0);

  await context.close();
});

test("manager simulation: create/update allowed, delete denied on every entity, restore still reachable via the runtime API", async ({ browser }) => {
  const context = await authedContext(browser, "owner");
  const page = await context.newPage();

  // Manager CAN create a project (perm_manager_project_create).
  const createRes = await page.request.post(`/api/apps/${fixtures.m09AppId}/runtime/entities/project/records?simulateRoleId=manager`, {
    data: { data: { name: "E2E Manager Project", status: "planning" } },
  });
  expect(createRes.status()).toBe(201);
  const { record: managerProject } = await createRes.json();

  // Manager has NO delete on project — the template grants
  // create/read/update only (see taskManagement.ts).
  const projectArchiveAttempt = await page.request.post(`/api/apps/${fixtures.m09AppId}/runtime/entities/project/records/${managerProject.id}/archive?simulateRoleId=manager`);
  expect(projectArchiveAttempt.status()).toBe(403);
  expect((await projectArchiveAttempt.json()).code).toBe("runtime_permission_denied");

  // Admin (real membership, no simulation) archives a fresh task for the
  // manager-restore case below.
  const target = await createRecordViaApi(page, fixtures.m09AppId, "task", {
    title: "E2E Manager Restore Target",
    status: "todo",
    priority: "low",
    project_ref: managerProject.id,
  });
  const archiveRes = await page.request.post(`/api/apps/${fixtures.m09AppId}/runtime/entities/task/records/${target.id}/archive`);
  expect(archiveRes.status()).toBe(200);

  // Manager cannot archive a task either (no perm_manager_task_delete).
  const managerArchiveAttempt = await page.request.post(`/api/apps/${fixtures.m09AppId}/runtime/entities/task/records/${target.id}/archive?simulateRoleId=manager`);
  expect(managerArchiveAttempt.status()).toBe(403);

  // But manager CAN restore it — restore only needs "update"
  // (perm_manager_task_update), reachable via the API even though the
  // table's "Show archived" toggle (gated on "delete") never renders for
  // manager — see this file's final report.
  const restoreRes = await page.request.post(`/api/apps/${fixtures.m09AppId}/runtime/entities/task/records/${target.id}/restore?simulateRoleId=manager`);
  expect(restoreRes.status()).toBe(200);
  expect((await restoreRes.json()).record.status).toBe("active");

  // UI: the Archive button never renders for manager on an active task's
  // detail view, and the archived-toggle is absent from the table.
  await page.goto(liveUrl(fixtures.m09AppId, "tasks", { simulateRoleId: "manager" }));
  await expect(page.getByText("Viewing as: Manager (simulated)")).toBeVisible();
  await expect(page.getByLabel("Show archived")).toHaveCount(0);
  await page.getByRole("row", { name: /E2E Manager Restore Target/ }).click();
  const detailActions = page.locator(".ab-detail__actions");
  await expect(detailActions.getByRole("button", { name: "Edit" })).toBeVisible();
  await expect(detailActions.getByRole("button", { name: "Archive" })).toHaveCount(0);

  await context.close();
});

test("seed-reset is never reachable by an actor with no AppBuilder collaborator relationship to the app", async ({ browser }) => {
  const context = await authedContext(browser, "unrelated");
  const page = await context.newPage();

  const res = await page.request.post(`/api/apps/${fixtures.m09AppId}/runtime/seed-reset`, { data: { confirm: true } });
  // assertCapability treats an unrelated actor identically to a
  // nonexistent app (see lib/repositories/authz.ts's docstring) — never a
  // distinguishing 403.
  expect(res.status()).toBe(404);

  await context.close();
});

test("a record id from one app is not fetchable through a different app's runtime API (404, not the record)", async ({ browser }) => {
  const context = await authedContext(browser, "owner");
  const page = await context.newPage();

  const listRes = await page.request.get(`/api/apps/${fixtures.m09AppId}/runtime/entities/project/records?pageSize=1`);
  const { records } = await listRes.json();
  const foreignId = records[0].id;

  // The owner is a real generated-app admin on BOTH m09App and
  // m09AppSecondary (each independently bootstrapped by resetGeneratedData
  // — see global-setup.ts#seedM09App), so this proves per-app scoping, not
  // just "not a member of the second app".
  const crossRes = await page.request.get(`/api/apps/${fixtures.m09AppSecondaryId}/runtime/entities/project/records/${foreignId}`);
  expect(crossRes.status()).toBe(404);

  await context.close();
});
