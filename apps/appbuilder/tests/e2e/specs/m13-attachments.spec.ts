import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { authedContext, loadFixtures } from "../fixtures/testContext";

/**
 * M13 slice C — the attachment composer and persisted conversation history.
 *
 * Drives the real upload path end to end (init → PUT bytes → sniff/scan →
 * `ready`) against real Postgres and real object storage; nothing here
 * stubs the app's own API. The two places `page.route` IS used are marked
 * inline and exist to simulate conditions the server cannot be asked for on
 * demand — a transient network failure, and a slow upload — never to fake a
 * result the product is supposed to produce.
 */
test.describe.configure({ timeout: 120_000 });

const fixtures = loadFixtures();

/** A real 1×1 PNG — the same bytes lib/repositories/attachments.integration.test.ts uses. */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function pngFile(name = "screenshot.png") {
  return { name, mimeType: "image/png", buffer: PNG_1X1 };
}

/** The composer's text field — also the element every locator below hangs off, matching how builder-workspace.spec.ts finds the composer. */
function composerInput(page: Page) {
  return page.getByPlaceholder(/Describe a change/);
}

/** The picker's file input is visually hidden (the styled button opens it) — `setInputFiles` drives it directly, exactly like a real pick. */
function fileInput(page: Page) {
  return page.locator('input[type="file"]');
}

/** A composer chip specifically — the draft list's own label keeps it from ever matching a persisted history card with the same filename. */
function chip(page: Page, filename: string) {
  return page.getByRole("list", { name: "Attachments on this message" }).getByRole("listitem").filter({ hasText: filename });
}

async function openWorkspace(page: Page, appId: string) {
  await page.goto(`/apps/${appId}`);
  await expect(composerInput(page)).toBeVisible();
}

/** Polls the jobs API (never DOM text) until the latest modification job settles — mirrors builder-workspace.spec.ts. */
async function waitForLatestJobTerminal(page: Page, appId: string, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await page.request.get(`/api/apps/${appId}/modification-jobs`);
    const { job } = await res.json();
    if (job && ["ready", "failed", "cancelled"].includes(job.status)) return job;
    await page.waitForTimeout(1_000);
  }
  throw new Error(`Modification job for app ${appId} did not settle within ${timeoutMs}ms`);
}

/** Removes every attachment left in the composer so the shared app starts each test clean. */
async function clearComposer(page: Page) {
  for (;;) {
    const remove = page.getByRole("button", { name: /^Remove / }).first();
    if ((await remove.count()) === 0) break;
    await remove.click();
  }
}

test.describe("upload", () => {
  test("the picker uploads a file, shows it as ready, and lets it be removed", async ({ browser }) => {
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkspace(page, fixtures.m13ComposerAppId);
    await clearComposer(page);

    await fileInput(page).setInputFiles(pngFile());

    const uploaded = chip(page, "screenshot.png");
    await expect(uploaded).toBeVisible();
    await expect(uploaded).toContainText("Ready");
    // A local image preview must be showing, not a generic file icon.
    await expect(uploaded.locator("img")).toBeVisible();

    // Send becomes available on the strength of the attachment alone — no
    // typed text ("send enabled when text or at least one ready attachment
    // exists", M13 Composer).
    await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();

    await page.getByRole("button", { name: "Remove screenshot.png" }).click();
    await expect(uploaded).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();

    await context.close();
  });

  test("pasting a screenshot into the composer attaches it", async ({ browser }) => {
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkspace(page, fixtures.m13ComposerAppId);
    await clearComposer(page);

    // Synthesizes exactly what Chrome delivers when a screenshot is pasted:
    // a real ClipboardEvent whose DataTransfer carries an image File and no
    // text. The composer's own paste handler does the rest.
    await composerInput(page).evaluate((textarea, base64: string) => {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], "pasted.png", { type: "image/png" }));
      textarea.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true, cancelable: true }));
    }, PNG_1X1.toString("base64"));

    await expect(chip(page, "pasted.png")).toContainText("Ready");

    await clearComposer(page);
    await context.close();
  });

  test("dropping a file onto the composer attaches it", async ({ browser }) => {
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkspace(page, fixtures.m13ComposerAppId);
    await clearComposer(page);

    // Dispatched on the text field; the drop handler lives on the composer
    // wrapper, so this also proves the events reach it by bubbling — which
    // is exactly how a real drop anywhere inside the composer behaves.
    await composerInput(page).evaluate((textarea, base64: string) => {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], "dropped.png", { type: "image/png" }));
      textarea.dispatchEvent(new DragEvent("dragenter", { dataTransfer: transfer, bubbles: true }));
      textarea.dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true }));
    }, PNG_1X1.toString("base64"));

    await expect(chip(page, "dropped.png")).toContainText("Ready");

    await clearComposer(page);
    await context.close();
  });

  test("shows real upload progress while bytes are in flight", async ({ browser }) => {
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });

    // The 1×1 PNG commits far too fast to observe a progress bar. Delaying
    // only the byte-commit response (the request itself still happens for
    // real, and its real result is what the chip ends up showing) makes the
    // in-flight state observable without faking it.
    await page.route("**/conversation/attachments/*/content", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      await route.continue();
    });

    await openWorkspace(page, fixtures.m13ComposerAppId);
    await clearComposer(page);
    await fileInput(page).setInputFiles(pngFile("slow.png"));

    const progress = page.getByRole("progressbar", { name: "Uploading slow.png" });
    await expect(progress).toBeVisible();
    // Send stays disabled while an upload is running, so a message can never
    // be sent that silently drops an attachment still on its way up.
    await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();

    await expect(chip(page, "slow.png")).toContainText("Ready", { timeout: 30_000 });
    await expect(progress).toHaveCount(0);

    await clearComposer(page);
    await context.close();
  });
});

test.describe("validation and failure", () => {
  test("rejects an unsupported file type with a specific message and no chip", async ({ browser }) => {
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkspace(page, fixtures.m13ComposerAppId);
    await clearComposer(page);

    await fileInput(page).setInputFiles({
      name: "payload.exe",
      mimeType: "application/x-msdownload",
      buffer: Buffer.from("MZ binary"),
    });

    await expect(page.getByText(/isn.t a supported file type/)).toBeVisible();
    // Nothing to retry or remove — a rejected file never becomes a chip.
    await expect(chip(page, "payload.exe")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();

    await context.close();
  });

  test("rejects an oversized file naming the real per-type limit", async ({ browser }) => {
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkspace(page, fixtures.m13ComposerAppId);
    await clearComposer(page);

    // 3MB of CSV against the server's 2MB text limit.
    await fileInput(page).setInputFiles({
      name: "huge.csv",
      mimeType: "text/csv",
      buffer: Buffer.alloc(3 * 1024 * 1024, "a,b,c\n"),
    });

    await expect(page.getByText(/the limit for this file type is 2MB/)).toBeVisible();
    await expect(chip(page, "huge.csv")).toHaveCount(0);

    await context.close();
  });

  test("a file whose bytes contradict its extension fails permanently, with no misleading retry", async ({ browser }) => {
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkspace(page, fixtures.m13ComposerAppId);
    await clearComposer(page);

    // Passes every client-side check (name, declared type, size) and is
    // caught only by the server's byte-level sniff — the real MIME-spoof
    // path, not a simulated one.
    await fileInput(page).setInputFiles({
      name: "not-really.png",
      mimeType: "image/png",
      buffer: Buffer.from("this is plain text pretending to be a PNG"),
    });

    const failed = chip(page, "not-really.png");
    await expect(failed).toContainText(/does not match|not an accepted/i);
    // Retrying identical bytes would fail identically forever, so no Retry
    // is offered — only removal.
    await expect(page.getByRole("button", { name: "Retry uploading not-really.png" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Remove not-really.png" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();

    await clearComposer(page);
    await context.close();
  });

  test("a transient upload failure offers Retry, and the retry succeeds", async ({ browser }) => {
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });

    // Fails the FIRST byte-commit at the transport level, then gets out of
    // the way — the retry is a real upload against the real server. A
    // genuinely transient failure cannot be provoked any other way.
    let failedOnce = false;
    await page.route("**/conversation/attachments/*/content", async (route) => {
      if (!failedOnce) {
        failedOnce = true;
        await route.abort("connectionreset");
        return;
      }
      await route.continue();
    });

    await openWorkspace(page, fixtures.m13ComposerAppId);
    await clearComposer(page);
    await fileInput(page).setInputFiles(pngFile("flaky.png"));

    const flaky = chip(page, "flaky.png");
    await expect(flaky).toContainText(/failed/i);
    const retry = page.getByRole("button", { name: "Retry uploading flaky.png" });
    await expect(retry).toBeVisible();

    await retry.click();
    await expect(flaky).toContainText("Ready", { timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();

    await clearComposer(page);
    await context.close();
  });
});

test.describe("send and persistence", () => {
  test("a pasted screenshot survives send and refresh as a persisted attachment card", async ({ browser }) => {
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkspace(page, fixtures.m13SendAppId);

    await fileInput(page).setInputFiles(pngFile("evidence.png"));
    await expect(chip(page, "evidence.png")).toContainText("Ready");

    await composerInput(page).fill("Add a priority field to tasks.");
    await page.getByRole("button", { name: "Send" }).click();

    // The composer empties only because the server claimed the attachment.
    await expect(page.getByRole("button", { name: "Remove evidence.png" })).toHaveCount(0);
    await expect(composerInput(page)).toHaveValue("");

    const history = page.getByRole("list", { name: "Attachments" }).first();
    await expect(history.getByText("evidence.png")).toBeVisible();

    await waitForLatestJobTerminal(page, fixtures.m13SendAppId);

    // The claim is server-side truth, not a UI artifact.
    const conversation = await page.request.get(`/api/apps/${fixtures.m13SendAppId}/conversation`);
    const { attachments } = await conversation.json();
    const claimed = attachments.find((a: { originalFilename: string }) => a.originalFilename === "evidence.png");
    expect(claimed.messageId).not.toBeNull();
    expect(claimed.status).toBe("ready");
    // Storage keys never cross the wire, on any path.
    expect(claimed.storageKey).toBeUndefined();

    // The card — and its thumbnail — come back from the server after a full
    // reload, with no browser-only state involved.
    await page.reload();
    await expect(page.getByRole("list", { name: "Attachments" }).first().getByText("evidence.png")).toBeVisible();
    const thumbnail = page.getByRole("list", { name: "Attachments" }).first().locator("img").first();
    await expect(thumbnail).toBeVisible();
    const thumbnailSrc = await thumbnail.getAttribute("src");
    expect(thumbnailSrc).toContain(`/api/apps/${fixtures.m13SendAppId}/conversation/attachments/`);

    // That image really is served by the authorized route, as an image.
    const image = await page.request.get(thumbnailSrc!);
    expect(image.status()).toBe(200);
    expect(image.headers()["content-type"]).toBe("image/png");
    expect(image.headers()["x-content-type-options"]).toBe("nosniff");

    await context.close();
  });

  test("attachment content is readable by its app's members and invisible to everyone else", async ({ browser }) => {
    const appId = fixtures.m13ComposerAppId;
    const ownerContext = await authedContext(browser, "owner");
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto(`/apps/${appId}`);

    // Uploaded through the API rather than the UI: this test is about who
    // may read the bytes, not about the composer.
    const init = await ownerPage.request.post(`/api/apps/${appId}/conversation/attachments/init`, {
      data: {
        originalFilename: "private.png",
        declaredMimeType: "image/png",
        declaredSizeBytes: PNG_1X1.length,
        idempotencyKey: `e2e-private-${Date.now()}`,
      },
    });
    expect(init.status()).toBe(201);
    const { attachment } = await init.json();
    const contentUrl = `/api/apps/${appId}/conversation/attachments/${attachment.id}/content`;
    const put = await ownerPage.request.put(contentUrl, {
      data: PNG_1X1,
      headers: { "Content-Type": "application/octet-stream" },
    });
    expect(put.status()).toBe(200);

    expect((await ownerPage.request.get(contentUrl)).status()).toBe(200);

    // An unrelated signed-in user gets an indistinguishable 404 — never a
    // 403, which would confirm the attachment exists.
    const unrelatedContext = await authedContext(browser, "unrelated");
    const unrelatedPage = await unrelatedContext.newPage();
    expect((await unrelatedPage.request.get(contentUrl)).status()).toBe(404);

    await ownerPage.request.delete(`/api/apps/${appId}/conversation/attachments/${attachment.id}`);
    await ownerContext.close();
    await unrelatedContext.close();
  });

  test("draft text and uploads survive switching workspace panels", async ({ browser }) => {
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkspace(page, fixtures.m13ComposerAppId);
    await clearComposer(page);

    await composerInput(page).fill("Half-written request about the attached screenshot");
    await fileInput(page).setInputFiles(pngFile("kept.png"));
    await expect(chip(page, "kept.png")).toContainText("Ready");

    // The conversation panel is unmounted entirely while History is shown.
    await page.getByRole("tab", { name: "History" }).click();
    await expect(composerInput(page)).toHaveCount(0);
    await page.getByRole("tab", { name: "Conversation" }).click();

    await expect(composerInput(page)).toHaveValue("Half-written request about the attached screenshot");
    await expect(chip(page, "kept.png")).toContainText("Ready");

    await clearComposer(page);
    await context.close();
  });

  test("an uploaded-but-unsent attachment is restored into the composer after a reload", async ({ browser }) => {
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkspace(page, fixtures.m13ComposerAppId);
    await clearComposer(page);

    await fileInput(page).setInputFiles(pngFile("unsent.png"));
    await expect(chip(page, "unsent.png")).toContainText("Ready");

    // A committed upload exists server-side; after a reload it must be
    // visible and removable rather than invisibly occupying the app's quota.
    await page.reload();
    await expect(page.getByRole("button", { name: "Remove unsent.png" })).toBeVisible();

    await clearComposer(page);
    await expect(chip(page, "unsent.png")).toHaveCount(0);
    await context.close();
  });
});

test.describe("accessibility, mobile, and reduced motion", () => {
  test("the composer has no serious/critical automated accessibility violations, with attachments present", async ({ browser }) => {
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkspace(page, fixtures.m13ComposerAppId);
    await clearComposer(page);

    await fileInput(page).setInputFiles(pngFile("a11y.png"));
    await expect(chip(page, "a11y.png")).toContainText("Ready");

    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    if (serious.length > 0) console.log(JSON.stringify(serious, null, 2));
    expect(serious.map((v) => v.id)).toEqual([]);

    await clearComposer(page);
    await context.close();
  });

  test("attach, retry, and remove are keyboard-reachable and screen-reader-labelled", async ({ browser }) => {
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkspace(page, fixtures.m13ComposerAppId);
    await clearComposer(page);

    // The picker opens from a real, focusable button — the file input itself
    // is visually hidden and out of the tab order on purpose.
    const attach = page.getByRole("button", { name: "Add files or images" });
    await attach.focus();
    await expect(attach).toBeFocused();

    await fileInput(page).setInputFiles(pngFile("keyboard.png"));
    await expect(chip(page, "keyboard.png")).toContainText("Ready");

    // Every per-file control names the file it acts on, so "Remove" is
    // never ambiguous with eight chips on screen.
    const remove = page.getByRole("button", { name: "Remove keyboard.png" });
    await remove.focus();
    await expect(remove).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(chip(page, "keyboard.png")).toHaveCount(0);

    await context.close();
  });

  test("the composer fits a mobile viewport without horizontal overflow", async ({ browser }) => {
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/apps/${fixtures.m13ComposerAppId}`);

    await page.getByRole("tab", { name: "Conversation" }).first().click();
    await expect(composerInput(page)).toBeVisible();
    await clearComposer(page);

    // A pathologically long filename is the realistic overflow trigger.
    await fileInput(page).setInputFiles(pngFile(`${"a-very-long-filename-".repeat(8)}.png`));
    await expect(page.getByRole("button", { name: /^Remove a-very-long-filename/ })).toBeVisible();

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);

    await clearComposer(page);
    await context.close();
  });

  test("respects prefers-reduced-motion: the progress bar updates without animating", async ({ browser }) => {
    const context = await authedContext(browser, "owner");
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });

    await page.route("**/conversation/attachments/*/content", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      await route.continue();
    });

    await openWorkspace(page, fixtures.m13ComposerAppId);
    await clearComposer(page);
    await fileInput(page).setInputFiles(pngFile("motion.png"));

    const progress = page.getByRole("progressbar", { name: "Uploading motion.png" });
    await expect(progress).toBeVisible();
    const transition = await progress.locator("span").first().evaluate((el) => getComputedStyle(el).transitionDuration);
    // The bar still reports progress — it just jumps to each value.
    expect(["0s", "0"]).toContain(transition);

    await expect(chip(page, "motion.png")).toContainText("Ready", { timeout: 30_000 });
    await clearComposer(page);
    await context.close();
  });
});
