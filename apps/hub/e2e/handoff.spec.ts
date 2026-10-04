/**
 * Hub's side of the OIDC hand-off, in a real browser (#803, spec §2.3 / §1.1).
 *
 * Real Hub (dev server), real sign-in form and session; the identity service is the stub in e2e/stubs/identity.ts,
 * which implements the contract in asafarim-os core/identity/README.md. The fake app is a different origin from
 * the identity service, as in production.
 */
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
} from "@playwright/test";
import { ADMIN_STORAGE_STATE, adminCredentials } from "./global-setup";

const IDENTITY = `http://localhost:${process.env.E2E_IDENTITY_PORT ?? 3901}`;
const APP_ORIGIN = `http://127.0.0.1:${process.env.E2E_APP_PORT ?? 3902}`;
const HUB = process.env.E2E_HUB_URL ?? "http://localhost:3001";
const APP_CB = new RegExp(
  `^${APP_ORIGIN.replace(/[.]/g, "\\.")}/cb\\?code=test-`
);

interface StubLog {
  mode: string;
  hits: { method: string; path: string; sub?: string; status?: number }[];
  appHits: string[];
}
const stubLog = async (): Promise<StubLog> =>
  (await fetch(`${IDENTITY}/__log`)).json() as Promise<StubLog>;
const setMode = (mode: "page" | "redirect") =>
  fetch(`${IDENTITY}/__mode`, {
    method: "POST",
    body: new URLSearchParams({ mode }),
  });

test.beforeEach(async () => {
  await fetch(`${IDENTITY}/__reset`, { method: "POST" });
});

/** The platform user id of whoever a context is signed in as, from Hub's own session endpoint. */
async function sessionUserId(context: BrowserContext): Promise<string> {
  const res = await context.request.get(`${HUB}/api/auth/session`);
  const session = (await res.json()) as { user?: { id?: string } };
  expect(session.user?.id, "the context is signed in").toBeTruthy();
  return session.user!.id!;
}

async function signInThroughForm(page: import("@playwright/test").Page) {
  const { email, password } = adminCredentials();
  await page.locator("#identifier").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
}

async function signedInContext(
  browser: Browser,
  options: Parameters<Browser["newContext"]>[0] = {}
) {
  return browser.newContext({ ...options, storageState: ADMIN_STORAGE_STATE });
}

test.describe("Hub OIDC hand-off", () => {
  test("signed in, contract mode 'page' → reaches the app", async ({
    browser,
  }) => {
    const context = await signedInContext(browser);
    const page = await context.newPage();
    await page.goto(`${IDENTITY}/start`);
    await page.waitForURL(APP_CB);
    await expect(page.locator("body")).toContainText("APP OK");

    const log = await stubLog();
    const assertions = log.hits.filter((h) => h.path.endsWith("/hub") && h.sub);
    expect(assertions).toHaveLength(1);
    expect(assertions[0]!.sub).toBe(await sessionUserId(context));
    await context.close();
  });

});

// The canary is its own describe so it can opt out of CI retries: a canary that sometimes reaches the app is
// exactly the signal we want, and a retry would hide it.
test.describe("Hub OIDC hand-off canary", () => {
  test.describe.configure({ retries: 0 });

  // CANARY. This asserts Chromium's behaviour: it applies Hub's `form-action <identity origin>` to every redirect
  // after the assertion POST, so an identity service that answers with a redirect chain reaching the app's origin
  // is blocked. It exists so that the "page" test above can't pass for the wrong reason. If this ever starts
  // reaching the app, Hub's CSP has loosened (or the browser changed): that needs a deliberate decision, not a
  // silent pass. Scoped to Chromium by the firefox project's grepInvert, not by a runtime skip.
  test("@chromium-only canary: mode 'redirect' is blocked by Hub's form-action", async ({
    browser,
  }) => {
    await setMode("redirect");
    const context = await signedInContext(browser);
    const page = await context.newPage();
    const consoleMessages: string[] = [];
    page.on("console", (m) => consoleMessages.push(m.text()));
    // The blocked navigation never finishes loading, so don't wait for "load".
    await page.goto(`${IDENTITY}/start`, { waitUntil: "commit" });

    await expect
      .poll(async () =>
        (await stubLog()).hits.some((h) => h.path.endsWith("/complete"))
      )
      .toBe(true);
    await expect
      .poll(() => consoleMessages.some((t) => t.includes("form-action")))
      .toBe(true);
    expect(new URL(page.url()).pathname).toBe("/oidc/continue");

    const log = await stubLog();
    expect(
      log.hits.some((h) => h.method === "POST" && h.path.endsWith("/hub"))
    ).toBe(true);
    expect(log.appHits).toEqual([]);
    await context.close();
  });
});

test.describe("Hub OIDC hand-off (continued)", () => {
  test("signed out → Hub sign-in → reaches the app", async ({ browser }) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();
    await page.goto(`${IDENTITY}/start`);
    await page.waitForURL(/\/sign-in/);
    await signInThroughForm(page); // well inside the ticket's 120 s
    await page.waitForURL(APP_CB, { timeout: 30_000 });
    await expect(page.locator("body")).toContainText("APP OK");
    await context.close();
  });

  test("JavaScript off → manual continue still reaches the app", async ({
    browser,
  }) => {
    const context = await signedInContext(browser, {
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    await page.goto(`${IDENTITY}/start`);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL(APP_CB);
    await expect(page.locator("body")).toContainText("APP OK");
    await context.close();
  });

  test("a forwarded link can't finish someone else's sign-in", async ({
    browser,
  }) => {
    // A (signed out) starts a sign-in and captures the Hub URL without following it.
    const a = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const start = await a.request.get(`${IDENTITY}/start`, { maxRedirects: 0 });
    expect(start.status()).toBe(303);
    const hubUrl = start.headers()["location"]!;
    expect(hubUrl).toContain("/oidc/continue?ticket=");

    // B (signed in) opens it. Hub hands B's assertion to the identity service, but B never held A's interaction cookie.
    const b = await signedInContext(browser);
    const page = await b.newPage();
    await page.goto(hubUrl);
    await expect
      .poll(async () =>
        (await stubLog()).hits.some((h) => h.path.endsWith("/complete"))
      )
      .toBe(true);

    const log = await stubLog();
    expect(log.hits.find((h) => h.path.endsWith("/complete"))?.status).toBe(
      400
    );
    await expect(page.locator("body")).toContainText("browser_mismatch");
    expect(log.appHits).toEqual([]);
    await a.close();
    await b.close();
  });
});
