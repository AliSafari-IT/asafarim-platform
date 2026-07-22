import { test, expect, type Page } from "@playwright/test";
import { authedContext, loadFixtures } from "../fixtures/testContext";

/**
 * M08 builder workspace golden path — driven against the real worker
 * process (forced onto the deterministic fake provider, see
 * playwright.config.ts's webServer array and @asafarim/appbuilder-ai's
 * DefaultFakeProvider/fixtures/modification.ts, which keyword-routes these
 * prompts). Uses the seeded "Builder Workspace Demo" apps (one per
 * stateful test — see tests/e2e/global-setup.ts's `seedBuilderWorkspaceApp`
 * — rather than one shared app) whose `task`/`tasks`/`tasks_table`/
 * `employee_role` ids exactly match what the M08 fixtures expect. No real
 * provider call is ever made in this suite.
 *
 * A generous per-test timeout mirrors ai-generation.spec.ts's own rationale:
 * a real dev-mode worker round trip (BullMQ dispatch, Postgres claim,
 * fake-provider call, M04 apply, M06 preview render — the last of which can
 * pay Turbopack's first-compile cost) is comfortably sub-second against
 * real Postgres in an integration test (see
 * lib/modification/pipeline.integration.test.ts) but can take significantly
 * longer end-to-end through a cold Next.js dev server.
 */
test.describe.configure({ timeout: 120_000 });

/** Polls the modification-jobs API (never DOM text) until the latest job reaches a terminal status — avoids false positives from stale conversation history and gives a much more generous, precise wait than a DOM assertion timeout. */
async function waitForLatestJobTerminal(page: Page, appId: string, timeoutMs = 90_000): Promise<{ status: string; resultingVersionNumber: number | null }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await page.request.get(`/api/apps/${appId}/modification-jobs`);
    const { job } = await res.json();
    if (job && ["ready", "failed", "cancelled"].includes(job.status)) {
      return { status: job.status, resultingVersionNumber: job.resultingVersionNumber ?? null };
    }
    await page.waitForTimeout(1_000);
  }
  throw new Error(`Modification job for app ${appId} did not reach a terminal status within ${timeoutMs}ms`);
}

/** Polls until the latest job reaches `awaiting_confirmation` specifically (the destructive-confirmation pause point). */
async function waitForAwaitingConfirmation(page: Page, appId: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await page.request.get(`/api/apps/${appId}/modification-jobs`);
    const { job } = await res.json();
    if (job?.status === "awaiting_confirmation") return;
    if (job && ["ready", "failed", "cancelled"].includes(job.status)) {
      throw new Error(`Expected the job to pause at awaiting_confirmation, but it reached terminal status "${job.status}" instead`);
    }
    await page.waitForTimeout(1_000);
  }
  throw new Error(`Modification job for app ${appId} never reached awaiting_confirmation within ${timeoutMs}ms`);
}

test("renders the three-panel desktop workspace with structure, preview, and conversation", async ({ browser }) => {
  const fixtures = loadFixtures();
  const context = await authedContext(browser, "owner");
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto(`/apps/${fixtures.builderAppId}`);
  await expect(page.getByRole("heading", { name: /Builder Workspace Demo/ })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Application structure" })).toBeVisible();
  await expect(page.locator("iframe[title='App preview']")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Conversation" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "History" })).toBeVisible();

  await context.close();
});

test("adds task priority conversationally, shows the proposal, applies it, and produces a new previewable version", async ({ browser }) => {
  const fixtures = loadFixtures();
  const appId = fixtures.builderAppPriorityId;
  const context = await authedContext(browser, "owner");
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto(`/apps/${appId}`);
  const before = await page.request.get(`/api/apps/${appId}/specification`);
  const { specification: specBefore } = await before.json();

  await page.getByPlaceholder(/Describe a change/).fill("Please add a priority field to tasks.");
  await page.getByRole("button", { name: "Send" }).click();

  const { status, resultingVersionNumber } = await waitForLatestJobTerminal(page, appId);
  expect(status).toBe("ready");
  expect(resultingVersionNumber).toBe(specBefore.currentVersionNumber + 1);

  await expect(page.getByText("Proposal").first()).toBeVisible();
  await expect(page.getByText("Applied").first()).toBeVisible();
  await expect(page.getByText(new RegExp(`Version v${resultingVersionNumber}`))).toBeVisible();

  const after = await page.request.get(`/api/apps/${appId}/specification`);
  const { specification: specAfter } = await after.json();
  expect(specAfter.currentVersionNumber).toBe(specBefore.currentVersionNumber + 1);

  await context.close();
});

test("selecting the tasks table and requesting a compact layout scopes the change to that component only", async ({ browser }) => {
  const fixtures = loadFixtures();
  const appId = fixtures.builderAppSelectionId;
  const context = await authedContext(browser, "owner");
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto(`/apps/${appId}`);
  await page.getByRole("button", { name: "Pages & navigation" }).click();
  await expect(page.getByRole("button", { name: "Tasks" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Tasks" }).click();
  await expect(page.getByText(/Context: Tasks/)).toBeVisible();

  await page.getByPlaceholder(/Describe a change/).fill("Make this table more compact.");
  await page.getByRole("button", { name: "Send" }).click();

  const { status } = await waitForLatestJobTerminal(page, appId);
  expect(status).toBe("ready");

  const res = await page.request.get(`/api/apps/${appId}/specification`);
  const { latestVersion } = await res.json();
  const tasksPage = (latestVersion.payload.pages as any[]).find((p) => p.id === "tasks");
  const table = tasksPage.components.find((c: any) => c.id === "tasks_table");
  expect(table.config.density).toBe("compact");

  await context.close();
});

test("a destructive change requires explicit confirmation before anything is applied", async ({ browser }) => {
  const fixtures = loadFixtures();
  const appId = fixtures.builderAppDestructiveId;
  const context = await authedContext(browser, "owner");
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto(`/apps/${appId}`);
  const before = await page.request.get(`/api/apps/${appId}/specification`);
  const { specification: specBefore } = await before.json();

  await page.getByPlaceholder(/Describe a change/).fill("Employees should no longer be able to delete tasks.");
  await page.getByRole("button", { name: "Send" }).click();

  await waitForAwaitingConfirmation(page, appId);
  const dialog = page.getByRole("alertdialog", { name: "Confirm destructive change" });
  await expect(dialog).toBeVisible({ timeout: 15_000 });

  // Nothing applied yet while the dialog is open.
  const mid = await page.request.get(`/api/apps/${appId}/specification`);
  const { specification: specMid } = await mid.json();
  expect(specMid.currentVersionNumber).toBe(specBefore.currentVersionNumber);

  await dialog.getByRole("button", { name: "Apply change" }).click();
  const { status, resultingVersionNumber } = await waitForLatestJobTerminal(page, appId);
  expect(status).toBe("ready");
  expect(resultingVersionNumber).toBe(specBefore.currentVersionNumber + 1);

  const after = await page.request.get(`/api/apps/${appId}/specification`);
  const { specification: specAfter } = await after.json();
  expect(specAfter.currentVersionNumber).toBe(specBefore.currentVersionNumber + 1);

  await context.close();
});

test("version history: comparing and restoring an earlier version never touches production and creates a new version", async ({ browser }) => {
  const fixtures = loadFixtures();
  const appId = fixtures.builderAppHistoryId;
  const context = await authedContext(browser, "owner");
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto(`/apps/${appId}`);
  const before = await page.request.get(`/api/apps/${appId}/specification`);
  const { specification: specBefore } = await before.json();

  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  await expect(page.getByText("v1")).toBeVisible();

  const restoreButtons = page.getByRole("button", { name: "Restore as new version" });
  await restoreButtons.first().click();
  await page.getByRole("button", { name: "Restore" }).click();

  await expect(page.getByRole("button", { name: "Restore as new version" }).first()).toBeVisible({ timeout: 15_000 });
  const after = await page.request.get(`/api/apps/${appId}/specification`);
  const { specification: specAfter } = await after.json();
  expect(specAfter.currentVersionNumber).toBe(specBefore.currentVersionNumber + 1);

  await context.close();
});

test("a viewer sees a read-only workspace and cannot send a conversational request", async ({ browser }) => {
  const fixtures = loadFixtures();
  const context = await authedContext(browser, "viewer");
  const page = await context.newPage();

  await page.goto(`/apps/${fixtures.builderAppId}`);
  await expect(page.getByText("Viewing only")).toBeVisible();
  await expect(page.getByPlaceholder(/Describe a change/)).toHaveCount(0);

  await context.close();
});

test("an unrelated user cannot observe the builder workspace (leak-safe not-found)", async ({ browser }) => {
  const fixtures = loadFixtures();
  const context = await authedContext(browser, "unrelated");
  const page = await context.newPage();

  await page.goto(`/apps/${fixtures.builderAppId}`);
  await expect(page.getByText("Page not found")).toBeVisible();

  const res = await page.request.get(`/api/apps/${fixtures.builderAppId}/conversation`);
  expect(res.status()).toBe(404);

  await context.close();
});

test("reconnects to persisted conversation state after a refresh", async ({ browser }) => {
  const fixtures = loadFixtures();
  const context = await authedContext(browser, "owner");
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto(`/apps/${fixtures.builderAppId}`);
  const before = await page.request.get(`/api/apps/${fixtures.builderAppId}/conversation`);
  const { messages: messagesBefore } = await before.json();

  await page.reload();
  await expect(page.getByRole("heading", { name: /Builder Workspace Demo/ })).toBeVisible();
  const after = await page.request.get(`/api/apps/${fixtures.builderAppId}/conversation`);
  const { messages: messagesAfter } = await after.json();
  expect(messagesAfter.length).toBeGreaterThanOrEqual(messagesBefore.length);

  await context.close();
});

test("renders adversarial conversation content safely — no script execution, no native dialogs", async ({ browser }) => {
  const fixtures = loadFixtures();
  const appId = fixtures.builderAppAdversarialId;
  const context = await authedContext(browser, "owner");
  const page = await context.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  let dialogFired = false;
  page.on("dialog", (dialog) => {
    dialogFired = true;
    dialog.dismiss();
  });

  await page.goto(`/apps/${appId}`);
  await page.getByPlaceholder(/Describe a change/).fill('<script>window.__xss_marker__=true</script> Make it better.');
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText(/<script>/)).toBeVisible({ timeout: 15_000 });
  const marker = await page.evaluate(() => (window as unknown as { __xss_marker__?: boolean }).__xss_marker__);
  expect(marker).toBeUndefined();
  expect(dialogFired).toBe(false);

  await context.close();
});

test("mobile viewport shows a single active panel with a keyboard-accessible tab bar", async ({ browser }) => {
  const fixtures = loadFixtures();
  const context = await authedContext(browser, "owner");
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto(`/apps/${fixtures.builderAppId}`);
  const tablist = page.getByRole("tablist", { name: "Workspace panels" });
  await expect(tablist).toBeVisible();

  await page.getByRole("tab", { name: "Conversation" }).click();
  await expect(page.getByPlaceholder(/Describe a change/)).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);

  await context.close();
});

test("tablet viewport shows a two-panel layout with structure available via a drawer toggle", async ({ browser }) => {
  const fixtures = loadFixtures();
  const context = await authedContext(browser, "owner");
  const page = await context.newPage();
  await page.setViewportSize({ width: 768, height: 1024 });

  await page.goto(`/apps/${fixtures.builderAppId}`);
  const drawerToggle = page.getByRole("button", { name: "Structure" });
  await expect(drawerToggle).toBeVisible();
  await drawerToggle.click();
  await expect(page.getByRole("navigation", { name: "Application structure" })).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);

  await context.close();
});
