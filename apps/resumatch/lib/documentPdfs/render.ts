import "server-only";

/**
 * Server-side PDF rendering for email attachments (send-application.md).
 *
 * Until now the only PDF was the browser's own print of the preview page
 * (components/tailoring/PrintButton.tsx), which never reaches the server.
 * An email attachment has to exist as bytes, so the server prints the very
 * same page in headless Chromium, with the same `@media print` rules: the
 * attachment looks exactly like the PDF the candidate downloads.
 *
 * Authentication: the page is loaded from this same server over its
 * internal address, carrying only the requesting candidate's own session
 * cookie, so it can only ever render their own document and goes through
 * the normal ownership checks. Every request that leaves the internal
 * origin is aborted before it is sent, so the cookie can never reach a
 * third party (an image URL, a font CDN).
 *
 * Config:
 * - `RESUMATCH_PDF_CHROMIUM_PATH`: the Chromium binary. Required; without
 *   it, PDF creation reports `renderer_unavailable` and nothing else breaks.
 * - `RESUMATCH_INTERNAL_URL`: how the server reaches itself, default
 *   `http://127.0.0.1:$PORT`.
 */

export class PdfRendererUnavailableError extends Error {
  constructor() {
    super("PDF renderer is not configured (RESUMATCH_PDF_CHROMIUM_PATH)");
    this.name = "PdfRendererUnavailableError";
  }
}

export class PdfRenderError extends Error {
  constructor(public readonly code: string) {
    super(`PDF render failed: ${code}`);
    this.name = "PdfRenderError";
  }
}

export function pdfRendererConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.RESUMATCH_PDF_CHROMIUM_PATH?.trim());
}

export function internalBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.RESUMATCH_INTERNAL_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  return `http://127.0.0.1:${env.PORT || "3012"}`;
}

/** Only the Auth.js session cookie (and its chunks) is forwarded. */
export function sessionCookieHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const kept = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter((part) => /^(?:__Secure-)?authjs\.session-token(?:\.\d+)?=/.test(part));
  return kept.length > 0 ? kept.join("; ") : null;
}

/** One render at a time per process: Chromium is heavy, and a burst of
 *  clicks must not start ten browsers on a small VPS. */
let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

export interface RenderRequest {
  /** App path, built by the caller from ids only, e.g. /tailor/<id>/preview. */
  path: string;
  /** CSS selector that must be present: the document itself. */
  readySelector: string;
  /** The incoming request's Cookie header. */
  cookieHeader: string | null;
}

export async function renderPagePdf(request: RenderRequest): Promise<Uint8Array> {
  const executablePath = process.env.RESUMATCH_PDF_CHROMIUM_PATH?.trim();
  if (!executablePath) throw new PdfRendererUnavailableError();
  if (!request.path.startsWith("/") || request.path.startsWith("//")) throw new PdfRenderError("bad_path");
  const cookie = sessionCookieHeader(request.cookieHeader);
  if (!cookie) throw new PdfRenderError("no_session");

  const base = internalBaseUrl();
  const origin = new URL(base).origin;

  return serialize(async () => {
    const { chromium } = await import("playwright-core");
    const browser = await chromium.launch({
      executablePath,
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    try {
      const context = await browser.newContext({
        extraHTTPHeaders: { cookie },
        javaScriptEnabled: true,
        serviceWorkers: "block",
      });
      const page = await context.newPage();
      await page.route("**/*", (route) => {
        const url = route.request().url();
        if (url.startsWith("data:") || new URL(url).origin === origin) return route.continue();
        return route.abort("blockedbyclient");
      });
      const response = await page.goto(`${base}${request.path}`, { waitUntil: "load", timeout: 30_000 });
      if (!response || !response.ok()) throw new PdfRenderError(`http_${response?.status() ?? "none"}`);
      // Landing anywhere else (a sign-in redirect) is never a document.
      if (new URL(page.url()).pathname !== request.path) throw new PdfRenderError("redirected");
      await page.waitForSelector(request.readySelector, { timeout: 15_000 });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
          Array.from(document.images)
            .filter((img) => !img.complete)
            .map(
              (img) =>
                new Promise((resolve) => {
                  img.addEventListener("load", resolve, { once: true });
                  img.addEventListener("error", resolve, { once: true });
                }),
            ),
        );
      });
      await page.emulateMedia({ media: "print" });
      // A browser prints without backgrounds by default, so the app's page
      // tint never shows on paper; here backgrounds are on (for the CV's
      // own accents), so the page itself is made white, like the printout.
      await page.addStyleTag({ content: "html, body { background: #fff !important; }" });
      const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
      return new Uint8Array(pdf);
    } catch (error) {
      if (error instanceof PdfRenderError) throw error;
      throw new PdfRenderError(error instanceof Error && /Timeout/i.test(error.name) ? "timeout" : "browser_error");
    } finally {
      await browser.close().catch(() => undefined);
    }
  });
}
