import "server-only";

/**
 * OCR for scanned CVs (JM-019, partial).
 *
 * This is a seam, not an implementation, and the reason is a security one
 * rather than a scheduling one.
 *
 * OCR means running an image decoder and a recognition engine over an
 * untrusted document. Those are large C/C++ surfaces with a long history of
 * memory-safety bugs, and running them inside the Next.js process — the
 * same process holding database credentials and every signed-in session —
 * is precisely the arrangement JM-019 says to avoid when it asks for
 * isolated OCR workloads. Doing it "just for now" would put the worst
 * parser in the pipeline in the best position in the process.
 *
 * So until there is an isolated worker to run it in, a document with no
 * text layer gets an honest `NO_TEXT_LAYER` and the candidate is told they
 * can type their profile instead. That is a worse experience than OCR and a
 * better one than a plausible-looking half-measure.
 *
 * The interface below is what that worker will implement, and
 * `lib/documents/service.ts` already routes to `NO_TEXT_LAYER` at the point
 * where it would be called.
 */

export interface OcrOutcome {
  ok: boolean;
  text: string;
  /** Engine identity, recorded on the profile version for reproducibility. */
  engine: string;
}

export interface OcrEngine {
  readonly name: string;
  recognize(bytes: Uint8Array, contentType: string): Promise<OcrOutcome>;
}

/** No engine configured. Callers must treat this as "no text available". */
export const unavailableOcrEngine: OcrEngine = {
  name: "none-configured",
  async recognize() {
    return { ok: false, text: "", engine: "none-configured" };
  },
};

export function createOcrEngine(
  _env: Record<string, string | undefined> = process.env,
): OcrEngine {
  // Deliberately always unavailable. When an isolated worker exists, this is
  // where it gets selected — and the selection will be by explicit
  // configuration, the same way the malware scanner is.
  return unavailableOcrEngine;
}
