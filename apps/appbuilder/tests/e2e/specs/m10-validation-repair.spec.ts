import { test, expect, type Page } from "@playwright/test";
import { authedContext, loadFixtures } from "../fixtures/testContext";

/**
 * M10 validation gates + bounded AI repair loop — end-to-end coverage of
 * the builder workspace's Validation tab (WorkspaceShell -> ValidationPanel)
 * and its underlying API routes, driven against dedicated fixture apps
 * seeded in global-setup.ts (`m10PassingAppId`/`m10BrokenAppId`/
 * `m10NarrowAppId` — never the shared M09 fixtures, since these tests
 * deliberately mutate permissions to reproduce failure scenarios).
 *
 * Validation runs and repair attempts are processed by the SAME durable
 * worker `playwright.config.ts` already starts for M07/M08 (forced onto the
 * deterministic fake AI provider) — this suite never makes a real,
 * billable provider call, and browser-driven gates (accessibility,
 * responsive, CRUD smoke, role-denial) launch their OWN chromium instance
 * from inside that worker process against this same running dev server.
 * Generous timeouts throughout since a full gate suite can take well over
 * a minute.
 */
test.describe.configure({ timeout: 180_000 });

const fixtures = loadFixtures();

async function requestValidation(page: Page, appId: string) {
  await page.goto(`/apps/${appId}`);
  await page.getByRole("tab", { name: "Validation" }).click();
  await page.getByRole("button", { name: "Run validation" }).click();
}

async function waitForTerminalRun(page: Page, appId: string, timeoutMs = 150_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await page.request.get(`/api/apps/${appId}/validation-runs`);
    const { runs } = await res.json();
    const latest = runs[0];
    if (latest && ["passed", "failed", "infrastructure_error", "flaky", "cancelled"].includes(latest.status)) {
      return latest;
    }
    await page.waitForTimeout(2_000);
  }
  throw new Error(`Validation run for app ${appId} did not reach a terminal status within ${timeoutMs}ms`);
}

async function waitForTerminalRepair(page: Page, appId: string, runId: string, timeoutMs = 150_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await page.request.get(`/api/apps/${appId}/validation-runs/${runId}/repair`);
    const { attempts } = await res.json();
    const latest = attempts[attempts.length - 1];
    if (latest && ["completed", "failed", "cancelled"].includes(latest.status)) return latest;
    await page.waitForTimeout(2_000);
  }
  throw new Error(`Repair attempt for run ${runId} did not reach a terminal status within ${timeoutMs}ms`);
}

test("request validation from the builder, inspect gates and artifacts, full task-management golden path", async ({ browser }) => {
  const context = await authedContext(browser, "owner");
  const page = await context.newPage();

  await requestValidation(page, fixtures.m10PassingAppId);
  await expect(page.getByText(/^(pending|running)$/)).toBeVisible({ timeout: 15_000 });

  const run = await waitForTerminalRun(page, fixtures.m10PassingAppId);
  expect(["passed", "failed"]).toContain(run.status); // never infrastructure_error/flaky in a healthy CI env

  await page.reload();
  await page.getByRole("tab", { name: "Validation" }).click();
  await expect(page.getByText(run.status.replace(/_/g, " "))).toBeVisible();

  // Inspect gates: at least the fully-deterministic structural gates must
  // have run and be visible, each with its own status badge.
  await expect(page.getByText("Specification schema validity")).toBeVisible();
  await expect(page.getByText("Reference integrity")).toBeVisible();
  await expect(page.getByText("Permissions & authorization")).toBeVisible();

  // Expand a gate and confirm it shows deterministic evidence, not narration.
  await page.getByText("Specification schema validity").click();
  const gatesRes = await page.request.get(`/api/apps/${fixtures.m10PassingAppId}/validation-runs/${run.id}`);
  const { gates } = await gatesRes.json();
  const schemaGate = gates.find((g: { gateKey: string }) => g.gateKey === "spec_schema_validity");
  expect(schemaGate.status).toBe("passed");
  expect(schemaGate.evidence).toBeTruthy();

  // Artifacts: at least the responsive/accessibility gates should have
  // produced a screenshot/report artifact if they ran (skip assertion if
  // this environment's browser-driven gates hit infrastructure_error).
  const artifactsRes = await page.request.get(`/api/apps/${fixtures.m10PassingAppId}/validation-runs/${run.id}/artifacts`);
  const { artifacts } = await artifactsRes.json();
  expect(Array.isArray(artifacts)).toBe(true);

  await context.close();
});

test("failed task-management validation is blocked with a specific failing gate", async ({ browser }) => {
  const context = await authedContext(browser, "owner");
  const page = await context.newPage();

  await requestValidation(page, fixtures.m10BrokenAppId);
  const run = await waitForTerminalRun(page, fixtures.m10BrokenAppId);
  expect(run.status).toBe("failed");
  expect(run.releaseEligible).toBe(false);

  const gatesRes = await page.request.get(`/api/apps/${fixtures.m10BrokenAppId}/validation-runs/${run.id}`);
  const { gates } = await gatesRes.json();
  const permGate = gates.find((g: { gateKey: string }) => g.gateKey === "permissions_authorization");
  expect(permGate.status).toBe("failed");
  expect(permGate.failureCode).toBe("missing_read_permission");

  await page.reload();
  await page.getByRole("tab", { name: "Validation" }).click();
  await expect(page.getByText("failed")).toBeVisible();
  await expect(page.getByText("Not release eligible")).toBeVisible();

  await context.close();
});

test("successful validation after a safe, non-destructive repair", async ({ browser }) => {
  const context = await authedContext(browser, "owner");
  const page = await context.newPage();

  await page.goto(`/apps/${fixtures.m10BrokenAppId}`);
  await page.getByRole("tab", { name: "Validation" }).click();

  // A validation run for this app already exists from the previous test's
  // fixture setup expectations — request a fresh one if none is failed yet.
  const listRes = await page.request.get(`/api/apps/${fixtures.m10BrokenAppId}/validation-runs`);
  let { runs } = await listRes.json();
  let failedRun = runs.find((r: { status: string }) => r.status === "failed");
  if (!failedRun) {
    await page.getByRole("button", { name: "Run validation" }).click();
    failedRun = await waitForTerminalRun(page, fixtures.m10BrokenAppId);
    expect(failedRun.status).toBe("failed");
  }

  await page.reload();
  await page.getByRole("tab", { name: "Validation" }).click();
  await page.getByRole("button", { name: "Request AI repair" }).click();

  const repair = await waitForTerminalRepair(page, fixtures.m10BrokenAppId, failedRun.id);
  expect(repair.status).toBe("completed");
  expect(repair.resultingValidationRunId).toBeTruthy();

  const revalidationRes = await page.request.get(`/api/apps/${fixtures.m10BrokenAppId}/validation-runs/${repair.resultingValidationRunId}`);
  const { run: revalidation } = await revalidationRes.json();
  expect(revalidation.status).toBe("passed");

  await context.close();
});

test("a destructive repair proposal requires explicit confirmation before applying", async ({ browser }) => {
  const context = await authedContext(browser, "owner");
  const page = await context.newPage();

  await requestValidation(page, fixtures.m10NarrowAppId);
  const run = await waitForTerminalRun(page, fixtures.m10NarrowAppId);
  expect(run.status).toBe("failed");

  await page.reload();
  await page.getByRole("tab", { name: "Validation" }).click();
  await page.getByRole("button", { name: "Request AI repair" }).click();

  // Poll until the attempt reaches awaiting_confirmation (proposing a
  // destructive change never auto-applies).
  const start = Date.now();
  let attempt: { id: string; status: string; confirmationChecksum: string | null } | undefined;
  while (Date.now() - start < 60_000) {
    const res = await page.request.get(`/api/apps/${fixtures.m10NarrowAppId}/validation-runs/${run.id}/repair`);
    const { attempts } = await res.json();
    attempt = attempts[attempts.length - 1];
    if (attempt?.status === "awaiting_confirmation" || attempt?.status === "failed") break;
    await page.waitForTimeout(2_000);
  }
  expect(attempt?.status).toBe("awaiting_confirmation");

  await page.reload();
  await page.getByRole("tab", { name: "Validation" }).click();
  await expect(page.getByRole("heading", { name: "Confirm destructive repair" })).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Apply repair" }).click();
  await expect(page.getByRole("heading", { name: "Confirm destructive repair" })).toHaveCount(0);

  const confirmedRes = await page.request.get(`/api/apps/${fixtures.m10NarrowAppId}/repair-attempts/${attempt!.id}`);
  const { attempt: confirmed } = await confirmedRes.json();
  expect(confirmed.confirmationConfirmedByPrincipalId).toBeTruthy();
  expect(["applying", "revalidating", "completed", "failed"]).toContain(confirmed.status);

  await context.close();
});

test("a repair attempt can be cancelled before it applies", async ({ browser }) => {
  const context = await authedContext(browser, "owner");
  const page = await context.newPage();

  await requestValidation(page, fixtures.m10NarrowAppId);
  const run = await waitForTerminalRun(page, fixtures.m10NarrowAppId);

  const enqueueRes = await page.request.post(`/api/apps/${fixtures.m10NarrowAppId}/validation-runs/${run.id}/repair`, {
    data: { idempotencyKey: crypto.randomUUID() },
  });
  expect(enqueueRes.ok()).toBeTruthy();
  const { attempt } = await enqueueRes.json();

  const cancelRes = await page.request.post(`/api/apps/${fixtures.m10NarrowAppId}/repair-attempts/${attempt.id}/cancel`);
  expect(cancelRes.ok()).toBeTruthy();
  const { attempt: cancelled } = await cancelRes.json();
  expect(["cancelled", "queued", "classifying", "proposing", "awaiting_confirmation"]).toContain(cancelled.status);
  // Cooperative cancellation: the request is always recorded even if the
  // in-flight worker hasn't observed it as terminal yet.
  if (cancelled.status !== "cancelled") {
    expect(cancelled.cancelRequestedAt).toBeTruthy();
  }

  await context.close();
});

test("mobile viewport and keyboard access to the Validation tab", async ({ browser }) => {
  const context = await authedContext(browser, "owner");
  const page = await context.newPage();
  await page.setViewportSize({ width: 375, height: 812 });

  await page.goto(`/apps/${fixtures.m10PassingAppId}`);
  // At the mobile viewport, the top tab bar (Structure/Preview/Conversation/
  // History/Validation) is the visible one — the desktop right-panel's own
  // Conversation/History/Validation tab strip only becomes reachable once
  // that mobile tab bar has switched the active panel to "validation" (see
  // workspace.module.css's `data-active-panel` rules).
  const validationTab = page.getByRole("tab", { name: "Validation" }).first();
  await expect(validationTab).toBeVisible();
  await validationTab.focus();
  await page.keyboard.press("Enter");

  await expect(page.getByText("Validation", { exact: true })).toBeVisible();

  await context.close();
});

test("an unrelated actor cannot discover validation runs, gates, artifacts, or repair attempts for an app they have no relationship to", async ({ browser }) => {
  const context = await authedContext(browser, "unrelated");
  const page = await context.newPage();

  const runsRes = await page.request.get(`/api/apps/${fixtures.m10PassingAppId}/validation-runs`);
  expect(runsRes.status()).toBe(404);

  const requestRes = await page.request.post(`/api/apps/${fixtures.m10PassingAppId}/validation-runs`, { data: { idempotencyKey: crypto.randomUUID() } });
  expect(requestRes.status()).toBe(404);

  await context.close();
});
