/**
 * Reads schema.org `JobPosting` structured data from a fetched job page.
 *
 * Most applicant-tracking systems and many career pages embed a
 * `<script type="application/ld+json">` block describing the role, so
 * crawlers don't have to guess which part of the page is the posting. It is
 * already in the HTML `fetchJobPosting` downloads, so reading it costs one
 * `JSON.parse` per block: no new dependency and no extra request.
 *
 * Everything here is best effort. Broken markup is common in the wild, so any
 * parse failure or unexpected shape returns nothing and the caller keeps its
 * existing heuristics. This module never throws for page content.
 */

export type JobPostingStructuredData = {
  title: string | null;
  employer: string | null;
  /** The posting's `description`, with any HTML still in it. */
  descriptionHtml: string | null;
};

/** One fetched page can't make the scan do unbounded work. */
const MAX_BLOCKS = 20;
const MAX_NODES = 500;
const MAX_DEPTH = 6;

/** Only the opening tag: the body is found with `indexOf`, so a page full of
 *  unclosed openers can't make a lazy `[\s\S]*?` rescan to the end each time. */
const LD_JSON_OPENER =
  /<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>/gi;

/**
 * Returns the first `JobPosting` on the page that carries a title or a
 * description, or `null` when there is none.
 */
export function extractJobPostingStructuredData(
  html: string
): JobPostingStructuredData | null {
  const opener = new RegExp(LD_JSON_OPENER.source, "gi");
  // Searched in `html` itself: `toLowerCase()` can lengthen a string ("İ"
  // becomes two code units), which would shift every index after it.
  const closer = /<\/script/gi;
  for (let blocks = 0; blocks < MAX_BLOCKS; blocks++) {
    const match = opener.exec(html);
    if (!match) break;

    const start = match.index + match[0].length;
    closer.lastIndex = start;
    const close = closer.exec(html);
    // No closing tag anywhere after this one means none after later ones either.
    if (!close) break;
    const end = close.index;
    opener.lastIndex = end;

    const parsed = parseJsonLd(html.slice(start, end));
    if (parsed === undefined) continue;

    const posting = findJobPosting(parsed);
    if (posting) return posting;
  }
  return null;
}

function parseJsonLd(source: string): unknown {
  const body = source
    .trim()
    // Some CMSs wrap the block in an HTML comment or CDATA section.
    .replace(/^<!--/, "")
    .replace(/-->$/, "")
    .replace(/^\/\*\s*<!\[CDATA\[\s*\*\//, "")
    .replace(/\/\*\s*\]\]>\s*\*\/$/, "")
    .trim();
  if (!body) return undefined;

  try {
    return JSON.parse(body);
  } catch {
    // A common real-world defect: literal line breaks or tabs inside a
    // description string, which strict JSON rejects. Outside strings they are
    // plain whitespace, so turning them into spaces is safe either way.
    try {
      return JSON.parse(body.replace(/[\r\n\t]+/g, " "));
    } catch {
      return undefined;
    }
  }
}

function findJobPosting(root: unknown): JobPostingStructuredData | null {
  const queue: Array<{ node: unknown; depth: number }> = [
    { node: root, depth: 0 },
  ];
  let visited = 0;

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next || ++visited > MAX_NODES) break;
    const { node, depth } = next;

    if (Array.isArray(node)) {
      if (depth < MAX_DEPTH)
        for (const item of node) queue.push({ node: item, depth: depth + 1 });
      continue;
    }
    if (!isRecord(node)) continue;

    if (isJobPostingType(node["@type"])) {
      const posting = readPosting(node);
      if (posting.title || posting.descriptionHtml) return posting;
    }

    // `@graph` wrappers, and a WebPage whose `mainEntity` is the posting.
    if (depth < MAX_DEPTH) {
      for (const key of ["@graph", "mainEntity"] as const) {
        if (key in node) queue.push({ node: node[key], depth: depth + 1 });
      }
    }
  }
  return null;
}

function isJobPostingType(type: unknown): boolean {
  const types = Array.isArray(type) ? type : [type];
  // "JobPosting", "schema:JobPosting" and "https://schema.org/JobPosting".
  return types.some(
    (t) => typeof t === "string" && /(^|[/:#])JobPosting$/.test(t.trim())
  );
}

function readPosting(node: Record<string, unknown>): JobPostingStructuredData {
  return {
    title: cleanLine(firstString(node.title) ?? firstString(node.name), 300),
    employer: cleanLine(organizationName(node.hiringOrganization), 200),
    descriptionHtml: firstString(node.description)?.trim() || null,
  };
}

function organizationName(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const name = organizationName(item);
      if (name) return name;
    }
    return null;
  }
  if (isRecord(value))
    return firstString(value.name) ?? firstString(value.legalName);
  return null;
}

/** schema.org allows a list wherever a single value goes. */
function firstString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value))
    return value.find((v): v is string => typeof v === "string") ?? null;
  return null;
}

function cleanLine(value: string | null, max: number): string | null {
  if (!value) return null;
  const text = decodeHtmlEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  return text || null;
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

/**
 * Decodes the named entities above plus numeric ones (`&#8217;`, `&#x27;`).
 * JSON-LD text is often entity-escaped, unlike the visible page text.
 */
export function decodeHtmlEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (entity, code: string) => {
      const lower = code.toLowerCase();
      if (lower.startsWith("#")) {
        const point = lower.startsWith("#x")
          ? Number.parseInt(lower.slice(2), 16)
          : Number.parseInt(lower.slice(1), 10);
        // Keep the entity as-is if it is not a valid code point.
        if (!Number.isInteger(point) || point <= 0 || point > 0x10ffff)
          return entity;
        if (point >= 0xd800 && point <= 0xdfff) return entity;
        return String.fromCodePoint(point);
      }
      return NAMED_ENTITIES[lower] ?? entity;
    }
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
