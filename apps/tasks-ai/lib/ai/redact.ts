/**
 * PII / secret redaction for AI prompts (docs: M06 "least-data prompts,
 * PII/secret redaction"). Runs on every input before it leaves the process
 * for a provider. Pure and dependency-free so it is unit-tested exhaustively.
 *
 * Conservative by design: it over-redacts rather than risk a token or an
 * email reaching a provider. The redacted text keeps enough shape
 * (`[EMAIL]`, `[SECRET]`) that the model can still reason about structure.
 */
const RULES: [RegExp, string][] = [
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[EMAIL]"],
  [/\b(?:sk|pk|rk|ghp|gho|xox[baprs])[-_][A-Za-z0-9\-_]{12,}\b/g, "[SECRET]"],
  [/\b[A-Za-z0-9_-]{2,}:\/\/[^\s"'@]+:[^\s"'@]+@[^\s"']+/g, "[DSN]"],
  [/\bBearer\s+[A-Za-z0-9._\-]{12,}\b/gi, "Bearer [SECRET]"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}\b/g, "[JWT]"],
  [/\b(?:\d[ -]?){13,19}\b/g, "[CARD]"],
  [/\b\+?\d[\d\s().-]{7,}\d\b/g, "[PHONE]"],
  [/\b[0-9a-fA-F]{32,}\b/g, "[HEX]"],
];

/**
 * One replacement, expressed in the coordinates of the string that rule pass
 * was applied to: `[start, end)` was removed and a token of `length`
 * characters put in its place.
 */
export interface RedactionEdit {
  start: number;
  end: number;
  length: number;
}

export interface RedactionResult {
  text: string;
  counts: Record<string, number>;
  /**
   * The replacements each rule pass made, oldest pass first. A provider only
   * ever sees `text`, so the character offsets it cites index *that* string;
   * `mapRedactedSpan` walks these passes backwards to recover the matching
   * span of the original input (issue #377 review: `[EMAIL]` is rarely the
   * same length as the address it replaced, so every later citation was
   * shifted and quoted the wrong words).
   */
  edits: RedactionEdit[][];
}

export function redact(input: string): RedactionResult {
  let text = input;
  const counts: Record<string, number> = {};
  const edits: RedactionEdit[][] = [];
  for (const [re, token] of RULES) {
    const pass: RedactionEdit[] = [];
    let out = "";
    let last = 0;
    re.lastIndex = 0;
    for (let m = re.exec(text); m !== null; m = re.exec(text)) {
      const start = m.index;
      const end = start + m[0].length;
      if (m[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      pass.push({ start, end, length: token.length });
      out += text.slice(last, start) + token;
      last = end;
      counts[token] = (counts[token] ?? 0) + 1;
    }
    if (pass.length === 0) {
      edits.push(pass);
      continue;
    }
    text = out + text.slice(last);
    edits.push(pass);
  }
  return { text, counts, edits };
}

/**
 * Translate one offset in the redacted string back to the original input.
 * `mode` matters because a span's exclusive end and its inclusive start
 * collapse differently when they land inside a token: the start of a
 * redacted range maps to the start of what was removed, the end to its end.
 */
export function mapRedactedOffset(
  pos: number,
  edits: RedactionEdit[][],
  mode: "start" | "end",
): number {
  let p = pos;
  for (let i = edits.length - 1; i >= 0; i--) p = mapThroughPass(p, edits[i], mode);
  return p;
}

function mapThroughPass(pos: number, pass: RedactionEdit[], mode: "start" | "end"): number {
  // `delta` is how far the post-pass string has drifted from the pre-pass one
  // at this point, accumulated over the edits already passed.
  let delta = 0;
  for (const e of pass) {
    const postStart = e.start + delta;
    const postEnd = postStart + e.length;
    if (mode === "start") {
      if (pos < postStart) return pos - delta;
      if (pos < postEnd) return e.start;
    } else {
      if (pos <= postStart) return pos - delta;
      if (pos <= postEnd) return e.end;
    }
    delta += e.length - (e.end - e.start);
  }
  return pos - delta;
}

/**
 * The span of the *original* input a redacted-string span refers to, or null
 * when it cannot be one (inverted, negative, or past the end of the source).
 * A citation that cannot be mapped is not evidence and must not be shown as
 * though it were.
 */
export function mapRedactedSpan(
  span: [number, number],
  edits: RedactionEdit[][],
  originalLength: number,
): [number, number] | null {
  const [start, end] = span;
  if (start < 0 || end <= start) return null;
  const mappedStart = mapRedactedOffset(start, edits, "start");
  const mappedEnd = mapRedactedOffset(end, edits, "end");
  if (mappedStart < 0 || mappedEnd <= mappedStart || mappedEnd > originalLength) return null;
  return [mappedStart, mappedEnd];
}

interface CitedOperation {
  citations: { span: [number, number] | null; assumption: boolean; quote?: string }[];
}

/**
 * Rewrite a draft's citation spans from redacted coordinates into the
 * original input's, so review quotes the words the user actually wrote.
 * A span that no longer resolves is dropped to `null` rather than left
 * pointing at unrelated text — the operation then reads as an assumption,
 * which is the honest label for a claim whose evidence was lost.
 */
export function mapCitationSpans<T extends CitedOperation>(
  operations: T[],
  edits: RedactionEdit[][],
  originalLength: number,
): T[] {
  return operations.map((op) => ({
    ...op,
    citations: op.citations.map((c) =>
      c.span === null ? c : { ...c, span: mapRedactedSpan(c.span, edits, originalLength) },
    ),
  }));
}

/** True when the input still appears to contain a secret after redaction. */
export function looksSensitive(text: string): boolean {
  return /\b(password|api[_-]?key|secret|token)\b\s*[:=]\s*\S+/i.test(text);
}
