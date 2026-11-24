import "server-only";
import path from "node:path";
import { Worker } from "node:worker_threads";

/**
 * Runs the PDF/DOCX parsers in a worker thread that can be killed (#528,
 * part 2).
 *
 * Part 1 (#854) put a deadline around the parse, but on the server's own
 * thread a deadline can only stop the parser where it yields. One
 * synchronous pdf.js or mammoth step that never yields (a pathological
 * object graph, a decompression bomb inside the file) would still hold the
 * whole Node process. A worker thread runs on its own V8 isolate, so
 * `terminate()` stops it mid-loop, and `resourceLimits` caps its heap so a
 * memory bomb kills the worker, not the server.
 *
 * Nothing here depends on the HTTP route (`maxDuration`): the same call
 * works from the planned BullMQ worker.
 *
 * The worker only parses. It returns the positioned text runs (PDF) or the
 * raw text (DOCX), and the reading-order reconstruction, whitespace
 * normalisation and length caps stay in `text.ts` on the calling thread.
 * That keeps the worker source small and free of app code, so it can be
 * shipped as a plain script without a second bundle.
 */

export type ParserKind = "pdf" | "docx";

export interface WorkerTextRun {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ParseResult =
  | { ok: true; kind: "pdf"; pages: { items: WorkerTextRun[]; width: number }[] }
  | { ok: true; kind: "docx"; text: string }
  | { ok: false; reason: "timeout" | "failed" | "memory" };

/**
 * Heap ceiling for one parse. Uploads are capped at 10 MB, and a real CV of
 * that size needs a small multiple of it in heap; 384 MB leaves generous
 * room for an unusual but legitimate file while keeping a memory bomb from
 * taking the server down with it.
 */
export const PARSER_MAX_HEAP_MB = 384;

/**
 * The worker's code, run with `eval: true` (CommonJS). The parsers are
 * loaded with `require` from the app directory (`parserBaseDir()`); they
 * are listed in `serverExternalPackages`, so they stay real packages in
 * node_modules rather than being bundled into a server chunk.
 *
 * Parser error messages are never posted back: pdf.js messages can quote
 * document content.
 */
const WORKER_SOURCE = String.raw`
const { parentPort, workerData } = require("node:worker_threads");

const { createRequire } = require("node:module");
const load = createRequire(require("node:path").join(workerData.baseDir, "noop.js"));
// pdf.js and mammoth warn on console about odd fonts or styles; those
// warnings can quote document text, so they are dropped here.
console.log = console.warn = console.info = console.error = () => {};

async function parsePdf(bytes) {
  const { getDocumentProxy } = load("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const page = await pdf.getPage(n);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = [];
    for (const raw of content.items) {
      if (typeof raw.str !== "string" || raw.str.length === 0) continue;
      items.push({
        text: raw.str,
        x: raw.transform[4],
        y: raw.transform[5],
        width: raw.width || 0,
        // height is 0 for some producers; the transform's vertical scale
        // is the reliable fallback.
        height: raw.height || Math.abs(raw.transform[3]) || 0,
      });
    }
    pages.push({ items, width: viewport.width });
  }
  return { ok: true, kind: "pdf", pages };
}

async function parseDocx(bytes) {
  const mammoth = load("mammoth");
  const result = await mammoth.extractRawText({
    buffer: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
  });
  return { ok: true, kind: "docx", text: String(result.value) };
}

(async () => {
  try {
    const bytes = new Uint8Array(workerData.bytes);
    const result = workerData.kind === "pdf" ? await parsePdf(bytes) : await parseDocx(bytes);
    parentPort.postMessage(result);
  } catch {
    parentPort.postMessage({ ok: false, reason: "failed" });
  }
})();
`;

export interface RunParserOptions {
  timeoutMs: number;
  /** Tests only: replaces the worker's code, e.g. with a busy loop. */
  source?: string;
  maxHeapMb?: number;
}

/**
 * Parses `bytes` in a fresh worker thread and settles within `timeoutMs`,
 * whatever the parser does. The worker is always terminated, so a finished,
 * failed or timed-out parse leaves no thread or timer behind.
 */
export function runParser(
  kind: ParserKind,
  bytes: Uint8Array,
  options: RunParserOptions,
): Promise<ParseResult> {
  // A private copy goes to the worker, so the caller's bytes stay usable.
  const copy = bytes.slice().buffer;
  return new Promise<ParseResult>((resolve) => {
    let settled = false;
    let worker: Worker | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const settle = (result: ParseResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (worker) void worker.terminate().catch(() => {});
      resolve(result);
    };

    try {
      worker = new Worker(options.source ?? WORKER_SOURCE, {
        eval: true,
        workerData: { kind, bytes: copy, baseDir: parserBaseDir() },
        transferList: [copy],
        resourceLimits: { maxOldGenerationSizeMb: options.maxHeapMb ?? PARSER_MAX_HEAP_MB },
        // The worker's stdout/stderr are piped here and discarded rather
        // than inherited, as a second guard against logging CV content.
        stdout: true,
        stderr: true,
      });
    } catch {
      settle({ ok: false, reason: "failed" });
      return;
    }

    worker.stdout.resume();
    worker.stderr.resume();
    timer = setTimeout(() => settle({ ok: false, reason: "timeout" }), options.timeoutMs);
    worker.once("message", (message: ParseResult) => settle(isParseResult(message) ? message : { ok: false, reason: "failed" }));
    worker.once("error", (error: NodeJS.ErrnoException) =>
      settle({ ok: false, reason: error?.code === "ERR_WORKER_OUT_OF_MEMORY" ? "memory" : "failed" }),
    );
    worker.once("exit", () => settle({ ok: false, reason: "failed" }));
  });
}

/**
 * Where the worker resolves `unpdf` and `mammoth` from: the app directory.
 * `next dev`, `next start`, vitest and the standalone `server.js` (which
 * changes into its own directory first) all run with that as the working
 * directory, and next.config.ts links both packages into the standalone
 * app's node_modules. A future background worker started from the app
 * directory (as `worker/index.ts` is) needs nothing more.
 */
function parserBaseDir(): string {
  keepParsersInBuildTrace();
  return path.resolve(process.cwd());
}

/**
 * The worker loads the parsers by name, which the build's file tracer cannot
 * see. These references make it ship both packages and their dependencies
 * (mammoth needs jszip, xmldom and others) in the standalone image. The
 * bundler compiles them to internal module ids, so the values are unused.
 */
function keepParsersInBuildTrace(): void {
  void [require.resolve("unpdf"), require.resolve("mammoth")];
}

function isParseResult(value: unknown): value is ParseResult {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.ok === false) return true;
  if (v.ok !== true) return false;
  if (v.kind === "pdf") return Array.isArray(v.pages);
  if (v.kind === "docx") return typeof v.text === "string";
  return false;
}
