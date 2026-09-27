import { readFileSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Download, type Locator, type Page } from "@playwright/test";

/**
 * AI Workbench launch gate (#684), fixture mode, no provider keys.
 *
 * Every primary workflow is driven with the keyboard only (Tab to reach a
 * control, Enter/Space to use it), checked with axe, and exercised against
 * failures of the provider, the network, and analytics. The last test reads
 * the server's own log to prove no tool content reached it.
 */
const CANARY = "E2ECANARYq7w9";

const TOOLS = [
  {
    slug: "requirements-to-test-plan",
    example: "Load the password-reset example",
    resultHeading: /^Scenarios \(/,
    edit: "Remove TC-01",
    handoff: { button: "Download for Testora", destination: "testora" },
    ownText: `As a shopper I can save items to a wishlist so that I can buy them later. The wishlist must keep items for 90 days. ${CANARY}`,
  },
  {
    slug: "notes-to-action-plan",
    example: "Load the help-centre move example",
    resultHeading: /^Tasks \(/,
    edit: "Remove T6",
    handoff: { button: "Download for TasksAI", destination: "tasksai" },
    ownText: `Planning sync\n- Draft the onboarding email.\n- Review the pricing page copy.\n- Decided: launch after the beta. ${CANARY}`,
  },
  {
    slug: "text-to-cited-timeline",
    example: "Load the library-history example",
    resultHeading: /^Events \(/,
    edit: "Reject EV-01",
    handoff: { button: "Download for TimelineAI", destination: "timelineai" },
    ownText: `The bridge was built between 1932 and 1937. Repairs ran from 1998 to 2001. The toll was dropped in 2005. ${CANARY}`,
  },
] as const;

test.beforeEach(async ({ page }) => {
  // Analytics unavailable in every test: the tools must not depend on it.
  await page.route("https://cloud.umami.is/**", (route) => route.abort());
});

/** Presses Tab until `target` has focus: a real keyboard traversal, not a programmatic focus. */
async function tabTo(page: Page, target: Locator, max = 150) {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement).catch(() => false)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Couldn't reach ${target} with the keyboard`);
}

async function downloadText(download: Download): Promise<string> {
  return readFileSync((await download.path())!, "utf8");
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.length} × ${v.help}`);
}

for (const tool of TOOLS) {
  test.describe(tool.slug, () => {
    test("keyboard only: example → run → review → export → handoff", async ({ page }) => {
      await page.goto(`/tools/${tool.slug}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

      await tabTo(page, page.getByRole("button", { name: tool.example }));
      await page.keyboard.press("Enter");
      await tabTo(page, page.getByRole("button", { name: "Run", exact: true }));
      await page.keyboard.press("Enter");

      // Focus moves to the outcome so keyboard and screen-reader users land on it.
      await expect(page.getByRole("heading", { name: tool.resultHeading })).toBeVisible();
      await expect(page.locator(":focus")).toContainText("Example result");

      await tabTo(page, page.getByRole("button", { name: tool.edit }));
      await page.keyboard.press("Enter");
      await expect(page.getByRole("status").filter({ hasText: /removed|rejected/ })).toBeAttached();

      await tabTo(page, page.getByRole("button", { name: "Download Markdown" }));
      const [markdown] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Enter")]);
      expect(await downloadText(markdown)).toMatch(/^# /);

      await tabTo(page, page.getByRole("button", { name: tool.handoff.button }));
      const [handoff] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Enter")]);
      const envelope = JSON.parse(await downloadText(handoff));
      expect(envelope).toMatchObject({ handoffVersion: "asafarim-handoff/1", destination: tool.handoff.destination, source: { tool: tool.slug } });
      await expect(page.getByRole("link", { name: /import →$/ })).toHaveAttribute("href", /\/import\/workbench$/);
    });

    test("no serious or critical accessibility violations before and after a result", async ({ page }) => {
      await page.goto(`/tools/${tool.slug}`);
      expect(await axe(page)).toEqual([]);
      await page.getByRole("button", { name: tool.example }).click();
      await page.getByRole("button", { name: "Run", exact: true }).click();
      await expect(page.getByRole("heading", { name: tool.resultHeading })).toBeVisible();
      expect(await axe(page)).toEqual([]);
    });

    test("own text in fixture mode is labelled as a prepared sample, never as live AI", async ({ page }) => {
      await page.goto(`/tools/${tool.slug}`);
      await page.getByRole("textbox").first().fill(tool.ownText);
      await page.getByRole("button", { name: "Run", exact: true }).click();
      await expect(page.getByText(/prepared sample output|Partial example result/)).toBeVisible();
      await expect(page.getByText("Result ready")).toHaveCount(0);
    });
  });
}

test.describe("resilience", () => {
  const slug = "notes-to-action-plan";

  test("provider unavailable: a clear message, and the page and example still work", async ({ page }) => {
    await page.route(`**/api/tools/${slug}/run`, async (route) => {
      const body = route.request().postDataJSON() as { mode: string };
      if (body.mode === "example") return route.continue();
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, envelopeVersion: 1, error: { code: "provider_disabled", message: "Live generation isn't available right now.", retryable: false } }),
      });
    });
    await page.goto(`/tools/${slug}`);
    await page.getByRole("textbox").first().fill(TOOLS[1].ownText);
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(page.locator('p[class*="statusTitle"]', { hasText: "Live generation isn't available" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();
    await page.getByRole("button", { name: TOOLS[1].example }).click();
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(page.getByRole("heading", { name: TOOLS[1].resultHeading })).toBeVisible();
  });

  test("network failure: no result, no internal detail, and one retry at most", async ({ page }) => {
    let calls = 0;
    await page.route(`**/api/tools/${slug}/run`, (route) => {
      calls += 1;
      return route.abort("failed");
    });
    await page.goto(`/tools/${slug}`);
    await page.getByRole("button", { name: TOOLS[1].example }).click();
    await page.getByRole("button", { name: "Run", exact: true }).click();
    const title = page.locator('p[class*="statusTitle"]', { hasText: "Something went wrong" });
    await expect(title).toBeVisible();
    // The outcome panel says what happened in plain words, with no internal detail.
    await expect(title.locator("..")).not.toContainText(/stack|ECONN|TypeError|fetch failed|Anthropic|\b5\d\d\b/i);
    expect(calls).toBeLessThanOrEqual(2);
  });

  test("leaving mid-run can't make the server work twice, and leaves no errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    const keys: string[] = [];
    await page.route(`**/api/tools/${slug}/run`, async (route) => {
      keys.push((route.request().postDataJSON() as { idempotencyKey: string }).idempotencyKey);
      await new Promise((r) => setTimeout(r, 1_500));
      await route.continue().catch(() => {});
    });
    await page.goto(`/tools/${slug}`);
    await page.getByRole("button", { name: TOOLS[1].example }).click();
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await page.goto("/tools");
    await page.waitForTimeout(2_000);
    // A full navigation can fail the in-flight fetch without aborting it, which triggers the runner's one
    // network retry. It reuses the same idempotency key, so the server joins the first run instead of
    // starting (and paying for) a second one.
    expect(keys.length).toBeGreaterThanOrEqual(1);
    expect(keys.length).toBeLessThanOrEqual(2);
    expect(new Set(keys).size).toBe(1);
    expect(errors).toEqual([]);
  });

  test("the catalogue and tool pages stay up with analytics blocked and live generation off", async ({ page }) => {
    const res = await page.goto("/tools");
    expect(res?.status()).toBe(200);
    expect(await axe(page)).toEqual([]);
    for (const tool of TOOLS) expect((await page.goto(`/tools/${tool.slug}`))?.status()).toBe(200);
  });
});

test.describe("performance budgets", () => {
  // Budgets for a production build on the E2E machine. Lab numbers, not field data; see docs/ai-tools/launch.md.
  const BUDGET = { scriptKb: 450, lcpMs: 2_500, cls: 0.1, interactionMs: 200, fixtureResponseMs: 800 };

  for (const tool of TOOLS) {
    test(`${tool.slug} stays within budget`, async ({ page }, info) => {
      await page.goto(`/tools/${tool.slug}`, { waitUntil: "networkidle" });
      const load = await page.evaluate(async () => {
        const scripts = performance.getEntriesByType("resource").filter((e) => (e as PerformanceResourceTiming).initiatorType === "script") as PerformanceResourceTiming[];
        const lcp = await new Promise<number>((resolve) => {
          new PerformanceObserver((list) => {
            const entries = list.getEntries();
            resolve(entries[entries.length - 1]?.startTime ?? 0);
          }).observe({ type: "largest-contentful-paint", buffered: true });
          setTimeout(() => resolve(0), 1_000);
        });
        let cls = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) if (!e.hadRecentInput) cls += e.value;
        }).observe({ type: "layout-shift", buffered: true });
        await new Promise((r) => setTimeout(r, 300));
        return { scriptKb: scripts.reduce((sum, s) => sum + (s.transferSize || s.encodedBodySize), 0) / 1024, lcpMs: lcp, cls };
      });

      await page.evaluate(() => {
        (window as unknown as { __events: number[] }).__events = [];
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) (window as unknown as { __events: number[] }).__events.push(e.duration);
        }).observe({ type: "event", buffered: true, durationThreshold: 16 } as PerformanceObserverInit);
      });
      await page.getByRole("button", { name: tool.example }).click();
      const started = Date.now();
      const [response] = await Promise.all([page.waitForResponse(`**/api/tools/${tool.slug}/run`), page.getByRole("button", { name: "Run", exact: true }).click()]);
      const fixtureResponseMs = Date.now() - started;
      expect(response.status()).toBe(200);
      await expect(page.getByRole("heading", { name: tool.resultHeading })).toBeVisible();
      const interactionMs = Math.max(0, ...(await page.evaluate(() => (window as unknown as { __events: number[] }).__events)));

      const measured = { ...load, interactionMs, fixtureResponseMs };
      await info.attach(`perf-${tool.slug}-${info.project.name}.json`, { body: JSON.stringify(measured, null, 2), contentType: "application/json" });
      console.log(`[perf] ${info.project.name} ${tool.slug} ${JSON.stringify(measured)}`);
      expect.soft(measured.scriptKb, "initial JavaScript (KB)").toBeLessThanOrEqual(BUDGET.scriptKb);
      expect.soft(measured.lcpMs, "LCP (ms)").toBeLessThanOrEqual(BUDGET.lcpMs);
      expect.soft(measured.cls, "CLS").toBeLessThanOrEqual(BUDGET.cls);
      expect.soft(measured.interactionMs, "slowest interaction (ms)").toBeLessThanOrEqual(BUDGET.interactionMs);
      expect.soft(measured.fixtureResponseMs, "fixture run response (ms)").toBeLessThanOrEqual(BUDGET.fixtureResponseMs);
    });
  }
});

test("server logs hold no tool content (runs last)", async () => {
  const log = readFileSync(path.join(__dirname, ".artifacts", "server.log"), "utf8");
  expect(log).toContain('"scope":"ai-tools"');
  expect(log).not.toContain(CANARY);
  for (const text of ["Kick-off: moving the help centre", "Riverside Library was founded", "forgotten my password", "wishlist"]) expect(log).not.toContain(text);
});
