import { mintSmokeSessionCookie } from "./authSession";

export interface SmokeHarness {
  browser: import("playwright-core").Browser;
  context: import("playwright-core").BrowserContext;
  page: import("playwright-core").Page;
  baseUrl: string;
  close(): Promise<void>;
}

export class SmokeHarnessUnavailableError extends Error {
  constructor(cause: unknown) {
    super("Could not launch the browser smoke-test harness (chromium unavailable in this environment).");
    this.name = "SmokeHarnessUnavailableError";
    this.cause = cause;
  }
}

function resolveBaseUrl(): string {
  return process.env.APPBUILDER_VALIDATION_BASE_URL ?? process.env.APPBUILDER_BASE_URL ?? "http://localhost:3006";
}

/**
 * Launches a real, isolated Chromium browser context authenticated as the
 * app owner, pointed at the running AppBuilder server's live preview route —
 * the shared driver for every browser-based validation gate (accessibility,
 * responsive, CRUD smoke, role-denial, workflow idempotency). Reuses the
 * exact same session-cookie mechanism and `?mode=live`/`?simulateRoleId=`
 * URL contract the M09 Playwright suite already drives against (see
 * tests/e2e/specs/m09-generated-data.spec.ts) — this is not a parallel
 * testing framework, only a second *invoker* of the same live preview
 * surface, run from inside the worker instead of from `playwright test`.
 *
 * Never targets any URL other than this app's own
 * `/apps/{appId}/preview...` route on the configured AppBuilder origin —
 * there is no code path here that accepts a spec-supplied or model-supplied
 * URL (see docs/appbuilder-m10-validation-qa.md's "never test arbitrary
 * external sites" guardrail).
 */
export async function launchSmokeHarness(ownerPrincipalId: string): Promise<SmokeHarness> {
  const baseUrl = resolveBaseUrl();
  let chromium: typeof import("playwright-core").chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch (err) {
    throw new SmokeHarnessUnavailableError(err);
  }

  let browser: import("playwright-core").Browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (err) {
    throw new SmokeHarnessUnavailableError(err);
  }

  const cookieValue = await mintSmokeSessionCookie(ownerPrincipalId);
  const hostname = new URL(baseUrl).hostname;
  const context = await browser.newContext({
    baseURL: baseUrl,
    storageState: {
      cookies: [
        {
          name: "authjs.session-token",
          value: cookieValue,
          domain: hostname,
          path: "/",
          expires: -1,
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    },
  });
  const page = await context.newPage();

  return {
    browser,
    context,
    page,
    baseUrl,
    async close() {
      await context.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
    },
  };
}

export interface LivePreviewUrlOptions {
  simulateRoleId?: string;
}

/** Builds a live-preview URL exactly like tests/e2e/specs/m09-generated-data.spec.ts's own `liveUrl` helper — kept as a separate, smaller implementation here since production code must not import from tests/. */
export function livePreviewUrl(baseUrl: string, appId: string, path: string[] = [], options: LivePreviewUrlOptions = {}): string {
  const suffix = path.length > 0 ? `/${path.map(encodeURIComponent).join("/")}` : "";
  const query = new URLSearchParams();
  if (options.simulateRoleId) query.set("simulateRoleId", options.simulateRoleId);
  else query.set("mode", "live");
  return `${baseUrl}/apps/${encodeURIComponent(appId)}/preview${suffix}?${query.toString()}`;
}
