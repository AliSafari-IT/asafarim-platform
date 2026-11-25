import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { log, logError } from "../../observability/logger";
import { isPublicHttpsUrl, MAX_RESPONSE_BYTES, MIN_USEFUL_CHARACTERS, readJobPage, USER_AGENT, type JobFetchResult, type PageEvidence } from "../fetchJob";

/**
 * Headless-render tier of job fetch (issue #518), for postings whose text
 * is written into the page by JavaScript after load (VDAB is the known
 * case). Off unless `RESUMATCH_JOB_FETCH_RENDER=on`; it reuses the PDF
 * renderer's Chromium (`RESUMATCH_PDF_CHROMIUM_PATH`).
 *
 * A real browser runs the page's own scripts, so it is a far wider SSRF
 * surface than the plain GET. Checking the pasted URL once is not enough:
 * the page can redirect, set `window.location`, call `fetch()`, open a
 * WebSocket or load an iframe. So:
 *
 * - Every HTTP request the page makes goes through one route handler,
 *   which checks the URL (public HTTPS host, and every address its name
 *   resolves to must be public) and then fetches it itself with
 *   `maxRedirects: 0`, following any redirect one hop at a time and
 *   checking each hop the same way (at most `MAX_RENDER_REDIRECTS`).
 * - Chromium itself is pointed at a proxy that does not exist, with
 *   loopback included. Anything that escaped the route handler (a
 *   preconnect, a WebSocket, a request type Playwright does not intercept)
 *   fails at that dead proxy instead of reaching the network.
 * - WebSockets are closed, service workers blocked, downloads refused,
 *   popups closed, images/media/fonts never loaded, and any document load
 *   on another origin (a top-level navigation or an iframe) is aborted.
 *
 * Resource bounds: one render at a time per process and at most
 * `MAX_WAITING_RENDERS` waiting (more are refused, not queued), a hard
 * wall-clock limit that closes the browser, a request count cap, a V8 heap
 * cap, and the same response size cap as the plain GET.
 *
 * Residual risk, documented in ventures/resumatch/engineering/job-fetch-render.md:
 * the address check and the fetch resolve the name separately, so a DNS
 * rebinding attacker with a sub-second TTL could still win the race. The
 * plain GET has the same gap.
 */

export const RENDER_WALL_CLOCK_MS = 25_000;
export const RENDER_NAVIGATION_TIMEOUT_MS = 15_000;
/** How long to wait after load for the posting text to appear. */
export const RENDER_SETTLE_MS = 6_000;
export const MAX_RENDER_REQUESTS = 200;
export const MAX_RENDER_REDIRECTS = 5;
export const MAX_WAITING_RENDERS = 2;
export const RENDER_JS_HEAP_MB = 256;

/** Why a render produced nothing. Logged, never shown to the candidate. */
export type RenderFailure =
  | "UNAVAILABLE"
  | "BUSY"
  | "LAUNCH_FAILED"
  | "URL_NOT_ALLOWED"
  | "HTTP_ERROR"
  | "LEFT_ORIGIN"
  | "TIMEOUT"
  | "NO_READABLE_TEXT"
  | "ERROR";

export type RenderResult =
  | Extract<JobFetchResult, { ok: true }>
  | { ok: false; failure: RenderFailure; evidence?: PageEvidence };

export type UrlPolicy = (url: string) => Promise<boolean>;

const BLOCKED_IPV4 =
  /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|22[4-9]\.|2[3-5]\d\.)/;

/** Whether one resolved address is a public unicast address. */
export function isPublicAddress(address: string): boolean {
  const a = address.toLowerCase();
  const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicAddress(mapped[1]!);
  if (isIP(a) === 4) return !BLOCKED_IPV4.test(a);
  if (isIP(a) === 6) {
    return !(a === "::" || a === "::1" || /^f[cd]/.test(a) || /^fe[89ab]/.test(a) || a.startsWith("ff"));
  }
  return false;
}

/**
 * The default policy: the plain GET's URL rule, plus every address the
 * host resolves to must be public (a public name pointing at 10.0.0.1 is
 * refused). Lookups are cached per render.
 */
export function publicHttpsPolicy(resolve: typeof lookup = lookup): UrlPolicy {
  const cache = new Map<string, Promise<boolean>>();
  return async (url) => {
    if (!isPublicHttpsUrl(url)) return false;
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
    if (isIP(host)) return isPublicAddress(host);
    let verdict = cache.get(host);
    if (!verdict) {
      verdict = resolve(host, { all: true, verbatim: true })
        .then((addresses) => addresses.length > 0 && addresses.every((entry) => isPublicAddress(entry.address)))
        .catch(() => false);
      cache.set(host, verdict);
    }
    return verdict;
  };
}

export function chromiumPath(env: NodeJS.ProcessEnv = process.env): string | null {
  return env.RESUMATCH_PDF_CHROMIUM_PATH?.trim() || null;
}

let active = 0;
let waiting = 0;
let chain: Promise<unknown> = Promise.resolve();

/** One render at a time; refuse rather than build a long queue. */
function serialize<T>(task: () => Promise<T>, busy: () => T): Promise<T> {
  if (active + waiting > MAX_WAITING_RENDERS) return Promise.resolve(busy());
  waiting += 1;
  const run = chain.then(async () => {
    waiting -= 1;
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
    }
  });
  chain = run.catch(() => undefined);
  return run;
}

export interface RenderOptions {
  /** Defaults to `publicHttpsPolicy()`. Tests pass a policy for a local server. */
  policy?: UrlPolicy;
  /** Defaults to `RESUMATCH_PDF_CHROMIUM_PATH`. */
  executablePath?: string | null;
  wallClockMs?: number;
}

export async function renderJobPosting(url: string, options: RenderOptions = {}): Promise<RenderResult> {
  const executablePath = options.executablePath === undefined ? chromiumPath() : options.executablePath;
  if (!executablePath) return { ok: false, failure: "UNAVAILABLE" };
  const policy = options.policy ?? publicHttpsPolicy();
  if (!(await policy(url))) return { ok: false, failure: "URL_NOT_ALLOWED" };

  return serialize(
    () => renderOnce(url, executablePath, policy, options.wallClockMs ?? RENDER_WALL_CLOCK_MS),
    () => ({ ok: false, failure: "BUSY" }),
  );
}

async function renderOnce(url: string, executablePath: string, policy: UrlPolicy, wallClockMs: number): Promise<RenderResult> {
  let chromium: typeof import("playwright-core").chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    return { ok: false, failure: "UNAVAILABLE" };
  }

  let browser: import("playwright-core").Browser;
  try {
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        // Anything the route handler does not serve hits a dead proxy.
        "--proxy-server=http://127.0.0.1:9",
        "--proxy-bypass-list=<-loopback>",
        "--dns-prefetch-disable",
        "--disable-background-networking",
        "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
        "--webrtc-ip-handling-policy=disable_non_proxied_udp",
        `--js-flags=--max-old-space-size=${RENDER_JS_HEAP_MB}`,
      ],
    });
  } catch {
    return { ok: false, failure: "LAUNCH_FAILED" };
  }

  const origin = new URL(url).origin;
  let leftOrigin = false;
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<RenderResult>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, failure: "TIMEOUT" }), wallClockMs);
  });

  const work = async (): Promise<RenderResult> => {
    const context = await browser.newContext({
      acceptDownloads: false,
      serviceWorkers: "block",
      javaScriptEnabled: true,
      userAgent: USER_AGENT,
      locale: "en-US",
    });
    let page: import("playwright-core").Page | null = null;
    context.on("page", (popup) => {
      if (page && popup !== page) void popup.close().catch(() => undefined);
    });
    await context.routeWebSocket(/.*/, (ws) => ws.close());
    let requests = 0;
    await context.route("**/*", async (route) => {
      const request = route.request();
      const target = request.url();
      requests += 1;
      if (requests > MAX_RENDER_REQUESTS) return route.abort("blockedbyclient");
      if (["image", "media", "font"].includes(request.resourceType())) return route.abort("blockedbyclient");
      let targetOrigin: string;
      try {
        targetOrigin = new URL(target).origin;
      } catch {
        return route.abort("blockedbyclient");
      }
      if (request.resourceType() === "document" && targetOrigin !== origin) {
        if (page && request.frame() === page.mainFrame()) leftOrigin = true;
        return route.abort("blockedbyclient");
      }
      if (!(await policy(target))) return route.abort("blockedbyclient");
      try {
        // Redirects are followed here, one checked hop at a time: Chromium
        // does not follow a 3xx that a route handler hands it.
        let hop = target;
        let response = await route.fetch({ maxRedirects: 0, timeout: RENDER_NAVIGATION_TIMEOUT_MS });
        for (let hops = 0; response.status() >= 300 && response.status() < 400; hops += 1) {
          const location = response.headers()["location"];
          if (!location || hops >= MAX_RENDER_REDIRECTS) return route.abort("blockedbyclient");
          hop = new URL(location, hop).toString();
          const isDocument = request.resourceType() === "document";
          if ((isDocument && new URL(hop).origin !== origin) || !(await policy(hop))) {
            if (isDocument && page && request.frame() === page.mainFrame()) leftOrigin = true;
            return route.abort("blockedbyclient");
          }
          response = await route.fetch({ url: hop, maxRedirects: 0, timeout: RENDER_NAVIGATION_TIMEOUT_MS });
        }
        const body = await response.body();
        if (body.length > MAX_RESPONSE_BYTES) return route.abort("blockedbyclient");
        return route.fulfill({ response, body });
      } catch {
        return route.abort("failed").catch(() => undefined);
      }
    });

    page = await context.newPage();
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: RENDER_NAVIGATION_TIMEOUT_MS }).catch(() => null);
    if (leftOrigin) return { ok: false, failure: "LEFT_ORIGIN" };
    if (!response || !response.ok()) return { ok: false, failure: "HTTP_ERROR" };

    // Wait for the posting text to appear, not for every tracker to finish.
    await page
      .waitForFunction((min) => (document.body?.innerText ?? "").trim().length >= min * 4, MIN_USEFUL_CHARACTERS, {
        timeout: RENDER_SETTLE_MS,
      })
      .catch(() => undefined);
    if (leftOrigin || new URL(page.url()).origin !== origin) return { ok: false, failure: "LEFT_ORIGIN" };

    const html = await page.content();
    if (html.length > MAX_RESPONSE_BYTES) return { ok: false, failure: "NO_READABLE_TEXT" };
    const result = readJobPage(html);
    if (result.ok) return result;
    return { ok: false, failure: "NO_READABLE_TEXT", evidence: result.evidence };
  };

  try {
    const result = await Promise.race([work().catch((): RenderResult => ({ ok: false, failure: "ERROR" })), deadline]);
    if (result.ok) log.info("tailoring.job_fetch_render.succeeded", { characters: result.rawText.length });
    else log.info("tailoring.job_fetch_render.failed", { failure: result.failure });
    return result;
  } catch (error) {
    logError("tailoring.job_fetch_render.error", error, {});
    return { ok: false, failure: "ERROR" };
  } finally {
    clearTimeout(timer);
    await browser.close().catch(() => undefined);
  }
}
