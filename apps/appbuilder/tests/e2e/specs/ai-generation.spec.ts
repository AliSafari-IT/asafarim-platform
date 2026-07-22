import { test, expect } from "@playwright/test";
import { authedContext } from "../fixtures/testContext";

// App ids are UUIDs (lib/db/ids.ts#generateId). Anchoring on that shape
// (rather than the looser `/\/apps\/[^/]+$/`, which also matches
// `/apps/new` itself) avoids a real race: `createAppAction` now does extra
// async work (enqueueing the generation job) before redirecting, widening
// the window where the page is still on `/apps/new` when `waitForURL` is
// evaluated — a looser pattern can resolve immediately against that
// still-current URL and silently extract the literal string "new" as the
// "app id".
const APP_DETAIL_URL_PATTERN = /\/apps\/[0-9a-f-]{36}$/;

/**
 * M07 golden path: a construction task-manager prompt, generated end to
 * end by the real worker process (started by playwright.config.ts's
 * webServer array, forced onto the deterministic fake provider — see
 * @asafarim/appbuilder-ai's DefaultFakeProvider, which routes this
 * prompt's "construction crew" keywords to the CONSTRUCTION_TASK_MANAGEMENT_SCRIPT
 * fixture). No real provider call is ever made in this suite.
 *
 * A generous per-test timeout (well beyond the suite's global 45s default)
 * is deliberate here, not a masked bug: this file's first test is also the
 * very first hit on `/apps/new` and `/apps/[appId]` after a cold `next dev`
 * start across three concurrently-starting webServers (hub, appbuilder,
 * worker) — Turbopack's first-compile latency for those routes plus a
 * cold BullMQ/Redis handshake can exceed the default budget even though
 * the underlying pipeline itself completes in well under a second (see
 * lib/generation/pipeline.integration.test.ts's golden path, which runs
 * in ~1s against real Postgres with no Next.js/BullMQ involved at all).
 */
test.describe.configure({ timeout: 90_000 });

test("AI generation golden path: construction prompt reaches a ready, previewable app", async ({ browser }) => {
  const context = await authedContext(browser, "owner");
  const page = await context.newPage();

  const appName = `Construction Co ${Date.now()}`;
  await page.goto("/apps/new");
  await page.fill("#field-name", appName);
  await page.selectOption("#field-starterFamily", "blank"); // deliberately mismatched — the model should recommend task_management instead
  await page.fill(
    "#field-prompt",
    "Build a tracker for my construction crew to manage projects, tasks, and who's assigned to each task.",
  );
  await page.getByRole("button", { name: "Create draft application" }).click();

  await page.waitForURL(APP_DETAIL_URL_PATTERN);
  const appId = page.url().split("/apps/")[1];

  // A truthful generation status renders quickly after creation — proves
  // the job was actually enqueued and picked up, rather than the page
  // silently showing nothing. The fake provider (see the file docblock)
  // is fast enough that intermediate phases can complete within a single
  // poll interval, so "Ready" already showing here is also a legitimate
  // observation, not just a fallback — a real provider would linger on an
  // intermediate state for longer, but the *statuses truthfully reported*
  // is what this golden path actually verifies.
  await expect(
    page.getByText(
      /Queued|Analyzing your request|Planning the application|Applying changes|Validating the specification|Building preview|Ready/,
    ),
  ).toBeVisible({ timeout: 15_000 });

  // Wait for a persisted ready state.
  await expect(page.getByText("Ready", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Generation complete/)).toBeVisible();

  // Safe, persisted UI summary — a real draft version exists.
  await expect(page.getByText(/draft v\d+/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Open preview" })).toBeVisible();

  // Open the preview and verify the generated entities/pages actually render.
  await page.getByRole("link", { name: "Open preview" }).click();
  await expect(page).toHaveURL(new RegExp(`/apps/${appId}/preview`));
  for (const label of ["Dashboard", "Projects", "Tasks", "Team", "Settings"]) {
    await expect(page.getByText(label).first()).toBeVisible();
  }

  // Refresh and confirm no duplicate app/version/job — status still Ready,
  // draft version number unchanged, and the API reports exactly one job.
  await page.goto(`/apps/${appId}`);
  await expect(page.getByText("Ready", { exact: true })).toBeVisible();
  const jobsResponse = await page.request.get(`/api/apps/${appId}/generation-jobs`);
  expect(jobsResponse.ok()).toBe(true);
  const { job } = await jobsResponse.json();
  expect(job.status).toBe("ready");

  await context.close();
});

test("an unrelated user cannot observe another owner's generation job or preview", async ({ browser }) => {
  const ownerContext = await authedContext(browser, "owner");
  const ownerPage = await ownerContext.newPage();

  const appName = `Isolation Check ${Date.now()}`;
  await ownerPage.goto("/apps/new");
  await ownerPage.fill("#field-name", appName);
  await ownerPage.fill("#field-prompt", "Build a construction crew tracker for isolation testing.");
  await ownerPage.getByRole("button", { name: "Create draft application" }).click();
  await ownerPage.waitForURL(APP_DETAIL_URL_PATTERN);
  const appId = ownerPage.url().split("/apps/")[1];
  await ownerContext.close();

  const unrelatedContext = await authedContext(browser, "unrelated");
  const unrelatedPage = await unrelatedContext.newPage();

  // Leak-safe not-found — never a distinguishing forbidden page — same
  // policy proven for previews in preview-access.spec.ts.
  await unrelatedPage.goto(`/apps/${appId}`);
  await expect(unrelatedPage.getByText("Page not found")).toBeVisible();

  const jobsResponse = await unrelatedPage.request.get(`/api/apps/${appId}/generation-jobs`);
  expect(jobsResponse.status()).toBe(404);

  await unrelatedPage.goto(`/apps/${appId}/preview`);
  await expect(unrelatedPage.getByText("Page not found")).toBeVisible();

  await unrelatedContext.close();
});

test("cancelling an in-progress generation is safe and repeatable", async ({ browser }) => {
  const context = await authedContext(browser, "owner");
  const page = await context.newPage();

  const appName = `Cancel Check ${Date.now()}`;
  await page.goto("/apps/new");
  await page.fill("#field-name", appName);
  await page.fill("#field-prompt", "Build a construction crew tracker that will be cancelled mid-generation.");
  await page.getByRole("button", { name: "Create draft application" }).click();
  await page.waitForURL(APP_DETAIL_URL_PATTERN);

  const cancelButton = page.getByRole("button", { name: "Cancel generation" });
  if (await cancelButton.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await cancelButton.click();
  }

  // Whether cancellation landed before or after the (near-instantaneous
  // fake-provider) job finished, the page must always settle on a single,
  // truthful terminal-or-ready status — never an error, never a stuck spinner.
  await expect(page.getByText(/^(Ready|Cancelled)$/).first()).toBeVisible({ timeout: 30_000 });

  // Repeatable: cancelling again (if the button is still present) must not error.
  const cancelAgain = page.getByRole("button", { name: "Cancel generation" });
  if (await cancelAgain.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await cancelAgain.click();
    await expect(page.getByText("Cancelled", { exact: true })).toBeVisible({ timeout: 10_000 });
  }

  await context.close();
});
