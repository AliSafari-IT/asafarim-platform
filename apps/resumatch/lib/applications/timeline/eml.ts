/**
 * A saved email (.eml) read into plain text for the timeline
 * (application-timeline.md). Run once, on the server, when the file is
 * uploaded; the result is stored as `emailPreview` and shown as text.
 *
 * Safety rules:
 * - Nothing here renders or executes anything. HTML is reduced to text
 *   (tags dropped, entities decoded); scripts, styles and remote images are
 *   simply never output, and the page shows the result as React text.
 * - Bounded: at most MAX_PARTS MIME parts, nesting depth MAX_DEPTH, and
 *   PREVIEW_MAX_CHARS characters of body text.
 * - Attached files inside the email are counted, never extracted.
 */

export const PREVIEW_MAX_CHARS = 50_000;
const HEADER_MAX_CHARS = 500;
const MAX_PARTS = 50;
const MAX_DEPTH = 5;

export interface EmailPreview {
  from: string | null;
  to: string | null;
  cc: string | null;
  subject: string | null;
  date: string | null;
  text: string;
  /** The body was HTML only and was reduced to text. */
  fromHtml: boolean;
  truncated: boolean;
  /** Files attached inside the email (not extracted). */
  attachedFiles: number;
}

interface Part {
  headers: Map<string, string>;
  body: Uint8Array;
}

function splitHeaderBody(bytes: Uint8Array): { head: string; body: Uint8Array } {
  // Header text is ASCII (RFC 5322); latin1 keeps every byte as one char so
  // offsets line up with the byte array.
  const text = new TextDecoder("latin1").decode(bytes);
  const match = /\r?\n\r?\n/.exec(text);
  if (!match) return { head: text, body: new Uint8Array() };
  return { head: text.slice(0, match.index), body: bytes.subarray(match.index + match[0].length) };
}

function parseHeaders(head: string): Map<string, string> {
  const headers = new Map<string, string>();
  const unfolded = head.replace(/\r?\n[ \t]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const m = /^([A-Za-z0-9-]+):\s?(.*)$/.exec(line);
    if (!m) continue;
    const name = m[1].toLowerCase();
    if (!headers.has(name)) headers.set(name, m[2]);
  }
  return headers;
}

function param(value: string | undefined, name: string): string | null {
  if (!value) return null;
  const re = new RegExp(`(?:^|;)\\s*${name}\\s*=\\s*(?:"([^"]*)"|([^;\\s]*))`, "i");
  const m = re.exec(value);
  return m ? (m[1] ?? m[2] ?? null) : null;
}

function decodeCharset(bytes: Uint8Array, charset: string | null): string {
  const label = (charset ?? "utf-8").trim().toLowerCase();
  try {
    return new TextDecoder(label === "us-ascii" ? "utf-8" : label, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function latin1Bytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

function decodeBase64(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/=]/g, "");
  try {
    return new Uint8Array(Buffer.from(clean, "base64"));
  } catch {
    return new Uint8Array();
  }
}

function decodeQuotedPrintable(text: string): Uint8Array {
  const soft = text.replace(/=\r?\n/g, "");
  const out: number[] = [];
  for (let i = 0; i < soft.length; i += 1) {
    const c = soft[i];
    if (c === "=" && /^[0-9A-Fa-f]{2}$/.test(soft.slice(i + 1, i + 3))) {
      out.push(parseInt(soft.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      out.push(soft.charCodeAt(i) & 0xff);
    }
  }
  return new Uint8Array(out);
}

function decodeTransfer(body: Uint8Array, encoding: string | undefined): Uint8Array {
  const enc = (encoding ?? "").trim().toLowerCase();
  const raw = new TextDecoder("latin1").decode(body);
  if (enc === "base64") return decodeBase64(raw);
  if (enc === "quoted-printable") return decodeQuotedPrintable(raw);
  return body;
}

/** RFC 2047 encoded words ("=?UTF-8?B?...?=") in a header. */
export function decodeEncodedWords(value: string): string {
  const joined = value.replace(/\?=\s+=\?/g, "?==?");
  return joined.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_all, charset: string, enc: string, data: string) => {
    const bytes = enc.toUpperCase() === "B" ? decodeBase64(data) : decodeQuotedPrintable(data.replace(/_/g, " "));
    return decodeCharset(bytes, charset);
  });
}

function cleanHeader(value: string | undefined): string | null {
  if (!value) return null;
  const text = decodeEncodedWords(value)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, HEADER_MAX_CHARS) : null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** HTML reduced to readable text. Output is text only, never markup. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head|title|noscript|template)[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote|table)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, code: string) => {
      if (code[0] === "#") {
        const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
      }
      return ENTITIES[code.toLowerCase()] ?? all;
    })
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitMultipart(body: Uint8Array, boundary: string): Uint8Array[] {
  const text = new TextDecoder("latin1").decode(body);
  const marker = `--${boundary}`;
  const pieces = text.split(marker);
  const parts: Uint8Array[] = [];
  // pieces[0] is the preamble; a piece starting "--" is the closing marker.
  for (const piece of pieces.slice(1)) {
    if (piece.startsWith("--")) break;
    parts.push(latin1Bytes(piece.replace(/^\r?\n/, "").replace(/\r?\n$/, "")));
    if (parts.length >= MAX_PARTS) break;
  }
  return parts;
}

interface Walk {
  plain: string | null;
  html: string | null;
  attachedFiles: number;
  parts: number;
}

function walk(part: Part, depth: number, state: Walk) {
  state.parts += 1;
  if (state.parts > MAX_PARTS || depth > MAX_DEPTH) return;
  const type = (part.headers.get("content-type") ?? "text/plain").toLowerCase();
  const disposition = (part.headers.get("content-disposition") ?? "").toLowerCase();
  const mime = type.split(";")[0].trim();

  if (mime.startsWith("multipart/")) {
    const boundary = param(part.headers.get("content-type"), "boundary");
    if (!boundary) return;
    for (const raw of splitMultipart(part.body, boundary)) {
      const { head, body } = splitHeaderBody(raw);
      walk({ headers: parseHeaders(head), body }, depth + 1, state);
    }
    return;
  }
  if (disposition.startsWith("attachment") || (!mime.startsWith("text/") && mime !== "message/rfc822")) {
    state.attachedFiles += 1;
    return;
  }
  if (mime === "message/rfc822") {
    state.attachedFiles += 1;
    return;
  }
  const decoded = decodeCharset(decodeTransfer(part.body, part.headers.get("content-transfer-encoding")), param(part.headers.get("content-type"), "charset"));
  if (mime === "text/html") state.html ??= decoded;
  else if (mime === "text/plain") state.plain ??= decoded;
}

export function parseEml(bytes: Uint8Array): EmailPreview {
  const { head, body } = splitHeaderBody(bytes);
  const headers = parseHeaders(head);
  const state: Walk = { plain: null, html: null, attachedFiles: 0, parts: 0 };
  walk({ headers, body }, 0, state);

  const fromHtml = state.plain === null && state.html !== null;
  let text = (state.plain ?? (state.html !== null ? htmlToText(state.html) : "")).replace(/\r\n/g, "\n").trim();
  // eslint-disable-next-line no-control-regex
  text = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  const truncated = text.length > PREVIEW_MAX_CHARS;
  if (truncated) text = text.slice(0, PREVIEW_MAX_CHARS);

  return {
    from: cleanHeader(headers.get("from")),
    to: cleanHeader(headers.get("to")),
    cc: cleanHeader(headers.get("cc")),
    subject: cleanHeader(headers.get("subject")),
    date: cleanHeader(headers.get("date")),
    text,
    fromHtml,
    truncated,
    attachedFiles: state.attachedFiles,
  };
}

/** Reads a stored preview back, or null when it isn't one. */
export function readEmailPreview(value: unknown): EmailPreview | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === "string" ? x : null);
  if (typeof v.text !== "string") return null;
  return {
    from: str(v.from),
    to: str(v.to),
    cc: str(v.cc),
    subject: str(v.subject),
    date: str(v.date),
    text: v.text,
    fromHtml: v.fromHtml === true,
    truncated: v.truncated === true,
    attachedFiles: typeof v.attachedFiles === "number" ? v.attachedFiles : 0,
  };
}
