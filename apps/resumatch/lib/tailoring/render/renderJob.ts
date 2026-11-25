import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { log, logError } from "../../observability/logger";
import { isPublicHttpsUrl, MAX_RESPONSE_BYTES, readJobPage, USER_AGENT, type JobFetchResult, type PageEvidence } from "../fetchJob";
import { pinnedFetch, type PinnedAddress } from "./pinnedFetch";

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
 *   resolves to must be public) and then sends it itself, from this
 *   process, to that checked address (`pinnedFetch`: no second DNS lookup,
 *   so no rebinding window), streamed under the size cap. Redirects are
 *   followed one hop at a time, each hop checked the same way (at most
 *   `MAX_RENDER_REDIRECTS`).
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
 * cap, and the same response size cap as the plain GET, applied to every
 * response while it streams in.
 *
 * Known limit, documented in ventures/resumatch/engineering/job-fetch-render.md:
 * a redirected subresource is served under its original URL, so a
 * redirected ES module's relative imports resolve against the old path.
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

/**
 * Decides whether a URL may be requested and, if so, which checked address
 * the connection goes to (null: refused). The address is used as is, so
 * the host is never resolved a second time.
 */
export type UrlPolicy = (url: string) => Promise<PinnedAddress | null>;

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
 * refused). Lookups are cached per render, and the first address is the
 * one the request is pinned to.
 */
export function publicHttpsPolicy(resolve: typeof lookup = lookup): UrlPolicy {
  const cache = new Map<string, Promise<PinnedAddress | null>>();
  return async (url) => {
    if (!isPublicHttpsUrl(url)) return null;
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
    const literal = isIP(host);
    if (literal) return isPublicAddress(host) ? { address: host, family: literal === 6 ? 6 : 4 } : null;
    let verdict = cache.get(host);
    if (!verdict) {
      verdict = resolve(host, { all: true, verbatim: true })
        .then((addresses): PinnedAddress | null => {
          if (addresses.length === 0 || !addresses.every((entry) => isPublicAddress(entry.address))) return null;
          return { address: addresses[0]!.address, family: addresses[0]!.family === 6 ? 6 : 4 };
        })
        .catch(() => null);
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
    // `frame()` throws for a popup's first navigation (its frame does not
    // exist yet); that is never the main frame.
    const isMainFrame = (request: import("playwright-core").Request): boolean => {
      try {
        return page !== null && request.frame() === page.mainFrame();
      } catch {
        return false;
      }
    };
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
        if (isMainFrame(request)) leftOrigin = true;
        return route.abort("blockedbyclient");
      }
      let pin = await policy(target);
      if (!pin) return route.abort("blockedbyclient");
      try {
        // Sent by this process to the checked address, never by Chromium,
        // and streamed under the size cap. Redirects are followed here, one
        // checked hop at a time: Chromium does not follow a 3xx that a
        // route handler hands it.
        const init = {
          headers: await request.allHeaders(),
          timeoutMs: RENDER_NAVIGATION_TIMEOUT_MS,
          maxBytes: MAX_RESPONSE_BYTES,
        };
        let hop = target;
        let response = await pinnedFetch(hop, pin, { ...init, method: request.method(), body: request.postDataBuffer() });
        for (let hops = 0; response.status >= 300 && response.status < 400; hops += 1) {
          const location = response.headers["location"];
          if (!location || hops >= MAX_RENDER_REDIRECTS) return route.abort("blockedbyclient");
          hop = new URL(location, hop).toString();
          const isDocument = request.resourceType() === "document";
          pin = isDocument && new URL(hop).origin !== origin ? null : await policy(hop);
          if (!pin) {
            if (isDocument && isMainFrame(request)) leftOrigin = true;
            return route.abort("blockedbyclient");
          }
          // A redirect turns the request into a GET, as browsers do for
          // 301/302/303; 307/308 keep the method and body.
          const keep = response.status === 307 || response.status === 308;
          response = await pinnedFetch(hop, pin, {
            ...init,
            method: keep ? request.method() : "GET",
            body: keep ? request.postDataBuffer() : null,
          });
        }
        return route.fulfill({ status: response.status, headers: response.headers, body: response.body });
      } catch {
        return route.abort("failed").catch(() => undefined);
      }
    });

    page = await context.newPage();
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: RENDER_NAVIGATION_TIMEOUT_MS }).catch(() => null);
    if (leftOrigin) return { ok: false, failure: "LEFT_ORIGIN" };
    if (!response || !response.ok()) return { ok: false, failure: "HTTP_ERROR" };

    // Wait until the page's own requests go quiet (the posting's API call
    // has answered), not merely until some text is painted: a shell can
    // paint its navigation and cookie banner long before the posting
    // arrives. A page that never goes quiet (polling trackers) is read
    // when the settle window ends.
    await page.waitForLoadState("networkidle", { timeout: RENDER_SETTLE_MS }).catch(() => undefined);
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
    else log.info("tailoring.job_fetch_render.failed", { reasonCode: result.failure });
    return result;
  } catch (error) {
    logError("tailoring.job_fetch_render.error", error, {});
    return { ok: false, failure: "ERROR" };
  } finally {
    clearTimeout(timer);
    await browser.close().catch(() => undefined);
  }
}
