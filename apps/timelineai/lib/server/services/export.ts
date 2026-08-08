import "server-only";
import puppeteer, { type Browser } from "puppeteer";

export type ExportFormat = "png" | "jpg" | "pdf";

export class ExportTimeoutError extends Error {
  readonly status = 504;
  constructor() {
    super("This export is taking too long. Please try again, or simplify the timeline (fewer images/events).");
    this.name = "ExportTimeoutError";
  }
}

const RENDER_TIMEOUT_MS = 20_000;
const MAX_EVENTS_FOR_EXPORT = 500; // matches TimelineInputSchema's cap — sanity bound, not a new limit

// A shared browser instance is reused across requests (launching Chromium
// per-request is slow and memory-heavy); it's lazily created and never
// explicitly closed — the process exiting cleans it up, same lifecycle as
// the lazy Prisma/Redis clients elsewhere in this app.
let _browser: Promise<Browser> | undefined;
function getBrowser(): Promise<Browser> {
  if (!_browser) {
    _browser = puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"], // required in most container runtimes
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    });
  }
  return _browser;
}

export interface RenderExportOptions {
  /** Full URL of the public timeline page to render (our own origin only — see route handler). */
  url: string;
  format: ExportFormat;
}

async function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ExportTimeoutError()), RENDER_TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Renders a timeline to PNG/JPG/PDF by navigating a headless Chromium tab
 * to our own public share page — the exact same React renderers the live
 * preview uses, so the export always matches what's on screen. The
 * `bare=1` query param (checked in app/layout.tsx) skips the platform
 * chrome (nav/footer) so the export is just the timeline itself.
 *
 * `url` is always server-constructed from our own origin + a validated
 * publicId (see the API route) — never user-controlled — so this does not
 * navigate to arbitrary attacker URLs. The remaining SSRF surface is
 * <img> tags inside the rendered page fetching event.imageUrl values,
 * which are constrained at the schema level (lib/schemas.ts#safeExternalUrl)
 * to https + non-private hosts, best-effort (no DNS-rebinding protection).
 */
export async function renderTimelineExport({ url, format }: RenderExportOptions): Promise<Buffer> {
  return withTimeout(renderInternal(url, format));
}

async function renderInternal(url: string, format: ExportFormat): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 2 });
    // Tells app/layout.tsx to skip the platform chrome (nav/footer) — the
    // export should be just the timeline, not the whole app shell.
    await page.setExtraHTTPHeaders({ "x-timelineai-render": "bare" });
    await page.goto(url, { waitUntil: "networkidle0", timeout: RENDER_TIMEOUT_MS });

    // Wait for web fonts to finish loading before capturing — otherwise a
    // screenshot can race a FOUT/FOIT repaint and ship with the fallback
    // font baked in.
    await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready);

    if (format === "pdf") {
      // Tall layouts (vertical/zigzag/radial/interactive/calendar) paginate
      // naturally down the page in portrait; the horizontally-scrolling
      // layouts (horizontal/gantt/roadmap) fit far more content per page in
      // landscape, so ask the rendered page which kind it is rather than
      // guessing from format alone.
      const layout = await page.evaluate(() => document.querySelector<HTMLElement>(".tl-root")?.dataset.layout ?? "vertical");
      const landscape = ["horizontal", "gantt", "roadmap"].includes(layout);

      const buffer = await page.pdf({
        format: "A4",
        landscape,
        printBackground: true,
        margin: { top: "16mm", bottom: "16mm", left: "12mm", right: "12mm" },
      });
      return Buffer.from(buffer);
    }

    const buffer = await page.screenshot({
      type: format === "jpg" ? "jpeg" : "png",
      quality: format === "jpg" ? 90 : undefined,
      fullPage: true, // captures content taller/wider than the viewport
    });
    return Buffer.from(buffer);
  } finally {
    await page.close();
  }
}
