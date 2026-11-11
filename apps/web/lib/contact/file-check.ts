/**
 * Content checks for contact-form attachments. The extension is only a claim; these
 * look at the bytes. A file passes only when its content matches its extension and
 * carries nothing that runs: no PDF actions or scripts, no Office macros or embedded
 * objects, no executables. The antivirus scan (`scanner.ts`) comes on top of this.
 *
 * Pure functions on a Buffer, so they are unit-tested without a server.
 */

export type FileCheck = { ok: true } | { ok: false; reason: string };

const ok: FileCheck = { ok: true };
const fail = (reason: string): FileCheck => ({ ok: false, reason });

/** The last extension, lower case ("" when there is none). */
const extension = (name: string): string =>
  /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? "";

/**
 * A safe display/storage name: no path parts, control or bidi-override characters,
 * no leading dots, and no dangerous "hidden" extension before the real one
 * ("invoice.exe.pdf" keeps its text but loses the dot, so it cannot pass as two types).
 */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    // control characters, bidi overrides/isolates, zero-width characters, quotes, angle brackets
    .replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩﻿"<>|?*:]/g, "")
    .replace(/^\.+/, "")
    .trim();
  const ext = extension(cleaned);
  const stem = ext ? cleaned.slice(0, -(ext.length + 1)) : cleaned;
  // Dots inside the stem are replaced so only the final extension is meaningful.
  const safeStem = stem.replace(/\.+/g, "_").slice(0, 150) || "file";
  return (ext ? `${safeStem}.${ext}` : safeStem).slice(0, 200);
}

const startsWith = (bytes: Buffer, ...sig: number[]): boolean =>
  bytes.length >= sig.length && sig.every((b, i) => bytes[i] === b);

// ---------------------------------------------------------------- PDF

/** Names that make a PDF do something on its own, or hide a payload inside it. */
const PDF_ACTIVE = [
  "JavaScript",
  "JS",
  "Launch",
  "OpenAction",
  "AA",
  "EmbeddedFile",
  "EmbeddedFiles",
  "RichMedia",
  "XFA",
  "SubmitForm",
  "ImportData",
  "GoToE",
  "GoToR",
  "Encrypt",
];

/** Decodes #XX escapes in PDF names, so /J#61vaScript cannot hide /JavaScript. */
const decodeNameEscapes = (text: string): string =>
  text.replace(/#([0-9a-fA-F]{2})/g, (_m, hex: string) =>
    String.fromCharCode(parseInt(hex, 16))
  );

export function checkPdf(bytes: Buffer): FileCheck {
  const head = bytes.subarray(0, 1024).toString("latin1");
  if (!head.includes("%PDF-")) return fail("not a PDF");
  if (!bytes.subarray(-2048).toString("latin1").includes("%%EOF"))
    return fail("truncated PDF");
  const text = decodeNameEscapes(bytes.toString("latin1"));
  for (const name of PDF_ACTIVE) {
    // a name token ends at whitespace or a delimiter
    if (new RegExp(`/${name}(?![A-Za-z0-9])`).test(text))
      return fail(`PDF contains active content (/${name})`);
  }
  return ok;
}

// ---------------------------------------------------------------- Office (OOXML = zip)

const ZIP_MAX_ENTRIES = 2_000;
const ZIP_MAX_ENTRY_BYTES = 100 * 1024 * 1024;
const ZIP_MAX_TOTAL_BYTES = 200 * 1024 * 1024;

/** The entry names and sizes from a zip's central directory, or a reason it cannot be read. */
export function readZipEntries(
  bytes: Buffer
):
  | { ok: true; entries: { name: string; size: number }[] }
  | { ok: false; reason: string } {
  const searchFrom = Math.max(0, bytes.length - 65_557);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= searchFrom; i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return { ok: false, reason: "not a valid zip container" };
  const count = bytes.readUInt16LE(eocd + 10);
  const cdSize = bytes.readUInt32LE(eocd + 12);
  const cdOffset = bytes.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff)
    return { ok: false, reason: "zip64 containers are not accepted" };
  if (count > ZIP_MAX_ENTRIES)
    return { ok: false, reason: "too many entries in the container" };
  if (cdOffset + cdSize > bytes.length)
    return { ok: false, reason: "corrupt zip directory" };

  const entries: { name: string; size: number }[] = [];
  let pos = cdOffset;
  for (let n = 0; n < count; n++) {
    if (pos + 46 > bytes.length || bytes.readUInt32LE(pos) !== 0x02014b50)
      return { ok: false, reason: "corrupt zip directory" };
    const size = bytes.readUInt32LE(pos + 24);
    const nameLen = bytes.readUInt16LE(pos + 28);
    const extraLen = bytes.readUInt16LE(pos + 30);
    const commentLen = bytes.readUInt16LE(pos + 32);
    if (pos + 46 + nameLen > bytes.length)
      return { ok: false, reason: "corrupt zip directory" };
    entries.push({
      name: bytes.subarray(pos + 46, pos + 46 + nameLen).toString("utf8"),
      size,
    });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return { ok: true, entries };
}

const OOXML_ROOT: Record<string, string> = {
  docx: "word/",
  xlsx: "xl/",
  pptx: "ppt/",
};
/** Parts that carry macros, embedded objects or programs. */
const OOXML_FORBIDDEN =
  /(^|\/)(vbaProject\.bin|vbaData\.xml|activeX[^/]*|oleObject[^/]*|embeddings\/.*|printerSettings\/.*)$|\.(exe|dll|scr|bat|cmd|com|js|jse|vbs|vbe|wsf|ps1|jar|lnk|hta|msi)$/i;

export function checkOoxml(
  bytes: Buffer,
  ext: "docx" | "xlsx" | "pptx"
): FileCheck {
  if (!startsWith(bytes, 0x50, 0x4b, 0x03, 0x04))
    return fail("not an Office Open XML file");
  const zip = readZipEntries(bytes);
  if (!zip.ok) return fail(zip.reason);
  const names = zip.entries.map((e) => e.name);
  if (!names.includes("[Content_Types].xml"))
    return fail("not an Office Open XML file");
  if (!names.some((n) => n.startsWith(OOXML_ROOT[ext]!)))
    return fail(`not a .${ext} document`);
  let total = 0;
  for (const entry of zip.entries) {
    if (entry.name.includes("..") || entry.name.startsWith("/"))
      return fail("unsafe path inside the file");
    if (OOXML_FORBIDDEN.test(entry.name))
      return fail("contains macros or embedded objects");
    if (entry.size > ZIP_MAX_ENTRY_BYTES)
      return fail("expands to an unreasonable size");
    total += entry.size;
  }
  if (total > ZIP_MAX_TOTAL_BYTES)
    return fail("expands to an unreasonable size");
  return ok;
}

// ---------------------------------------------------------------- images and text

function checkImage(bytes: Buffer, ext: string): FileCheck {
  switch (ext) {
    case "png":
      return startsWith(bytes, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
        ? ok
        : fail("not a PNG image");
    case "jpg":
    case "jpeg":
      return startsWith(bytes, 0xff, 0xd8, 0xff)
        ? ok
        : fail("not a JPEG image");
    case "gif": {
      const head = bytes.subarray(0, 6).toString("latin1");
      return head === "GIF87a" || head === "GIF89a"
        ? ok
        : fail("not a GIF image");
    }
    case "webp":
      return bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
        bytes.subarray(8, 12).toString("latin1") === "WEBP"
        ? ok
        : fail("not a WebP image");
    case "heic": {
      const brand = bytes.subarray(4, 12).toString("latin1");
      return /^ftyp(heic|heix|hevc|mif1|msf1)/.test(brand)
        ? ok
        : fail("not a HEIC image");
    }
    default:
      return fail("unsupported image type");
  }
}

function checkText(bytes: Buffer): FileCheck {
  if (bytes.includes(0)) return fail("binary content in a text file");
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return fail("text file is not valid UTF-8");
  }
  return ok;
}

/** Whether `bytes` really are what the file name says, and are free of active content. */
export function checkFileContent(fileName: string, bytes: Buffer): FileCheck {
  if (bytes.length === 0) return fail("empty file");
  const ext = extension(fileName);
  // Executables and scripts are refused whatever they are called.
  if (
    startsWith(bytes, 0x4d, 0x5a) ||
    startsWith(bytes, 0x7f, 0x45, 0x4c, 0x46) ||
    startsWith(bytes, 0xca, 0xfe, 0xba, 0xbe)
  )
    return fail("executable content");
  switch (ext) {
    case "pdf":
      return checkPdf(bytes);
    case "docx":
    case "xlsx":
    case "pptx":
      return checkOoxml(bytes, ext);
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
    case "heic":
      return checkImage(bytes, ext);
    case "txt":
    case "md":
    case "markdown":
    case "csv":
      return checkText(bytes);
    default:
      return fail("file type not accepted");
  }
}
