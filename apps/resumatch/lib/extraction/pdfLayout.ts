/**
 * Reconstructing reading order from PDF text positions (JM-019).
 *
 * A PDF has no notion of reading order. It has drawing instructions, and a
 * text extractor returns them in whatever sequence the producer emitted —
 * which for a two-column CV interleaves the columns. Every previous attempt
 * to parse those documents failed for the same reason, in a different
 * disguise each time: a heading appearing after the content it labels, a
 * heading fused to another column's first line, a sentence running straight
 * into an email address from the opposite side of the page.
 *
 * Those were all one bug. The text was never in reading order, so no amount
 * of cleverness applied *to the text* could recover it.
 *
 * Positions can. Every text run carries an (x, y) origin and a width, so the
 * page's column structure is recoverable: find the vertical gutter that no
 * text crosses, assign runs to the column they fall in, and read each column
 * top to bottom. What comes out is what a person reads.
 *
 * Deliberately pure and geometry-only — no PDF library types — so the logic
 * is testable with plain numbers rather than fixture documents.
 */

export interface PositionedItem {
  text: string;
  /** Left edge, in PDF units, origin bottom-left. */
  x: number;
  /** Baseline y, in PDF units. Larger is *higher* on the page. */
  y: number;
  width: number;
  height: number;
}

/**
 * A gutter must be at least this fraction of the page wide to count as a
 * column separator. Narrower gaps are ordinary word or indent spacing —
 * splitting on those would shred a single-column document into fragments.
 */
const MIN_GUTTER_RATIO = 0.025;

/**
 * Each side of a split must hold at least this share of the page's text.
 * Without it, a single indented block or a page number in the margin reads
 * as a column of its own.
 */
const MIN_COLUMN_SHARE = 0.08;

/** Lines closer together than this multiple of text height are the same line. */
const LINE_TOLERANCE_RATIO = 0.5;

/**
 * A horizontal gap wider than this multiple of text height means a real
 * space between two runs on the same line, rather than a mid-word break in
 * the drawing instructions.
 */
const SPACE_GAP_RATIO = 0.22;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * How many lines may cross a band and still leave it a gutter, as a share of
 * all lines on the page.
 *
 * A strict "no text crosses this band" rule fails on almost every designed
 * CV, because the name and job title are usually set across the full width
 * above the columns. On the document that prompted this, exactly two runs
 * out of 207 spanned the gutter, and requiring zero found no columns at all.
 */
const GUTTER_CROSSING_TOLERANCE = 0.02;

/** Group items into lines by their baseline, ignoring which column they are in. */
function groupIntoLines(items: PositionedItem[]): PositionedItem[][] {
  const textHeight = median(items.map((item) => item.height).filter((height) => height > 0)) || 8;
  const tolerance = textHeight * LINE_TOLERANCE_RATIO;
  const sorted = [...items].sort((a, b) => b.y - a.y);

  const lines: PositionedItem[][] = [];
  for (const item of sorted) {
    const current = lines.at(-1);
    if (current && Math.abs(current[0].y - item.y) <= tolerance) current.push(item);
    else lines.push([item]);
  }
  return lines;
}

/**
 * Find the x positions where the page splits into columns.
 *
 * Counts, for each vertical band, how many *lines* of text cross it. A
 * column gutter is a wide band that almost nothing crosses — "almost"
 * being the important part, since a full-width heading above the columns is
 * normal and must not hide them.
 */
export function detectColumnBoundaries(items: PositionedItem[], pageWidth: number): number[] {
  if (items.length < 8) return [];

  // Counted per *run*, not per line. Grouping into lines first is the
  // obvious approach and it destroys the signal: on a two-column page, every
  // row with text on both sides becomes one line spanning the full width, so
  // the gutter looks fully occupied and no column is ever found.
  const width = Math.max(1, Math.ceil(pageWidth));
  const crossings = new Uint16Array(width);
  for (const item of items) {
    const left = Math.max(0, Math.floor(item.x));
    const right = Math.min(width, Math.ceil(item.x + Math.max(item.width, 1)));
    for (let index = left; index < right; index += 1) crossings[index] += 1;
  }

  // Look only between the leftmost and rightmost text, so page margins are
  // not mistaken for gutters.
  const first = crossings.findIndex((count) => count > 0);
  let last = -1;
  for (let index = width - 1; index >= 0; index -= 1) {
    if (crossings[index] > 0) {
      last = index;
      break;
    }
  }
  if (first === -1 || last <= first) return [];

  const tolerance = Math.max(2, Math.floor(items.length * GUTTER_CROSSING_TOLERANCE));
  const minGutter = pageWidth * MIN_GUTTER_RATIO;
  const boundaries: number[] = [];

  let runStart = -1;
  for (let index = first; index <= last + 1; index += 1) {
    const quiet = index <= last && crossings[index] <= tolerance;
    if (quiet) {
      if (runStart === -1) runStart = index;
      continue;
    }
    if (runStart !== -1) {
      const gapWidth = index - runStart;
      if (gapWidth >= minGutter) boundaries.push(runStart + gapWidth / 2);
      runStart = -1;
    }
  }

  // Keep only splits with enough text on both sides, so one indented block
  // or a marginal note does not read as a column.
  return boundaries.filter((boundary) => {
    const left = items.filter((item) => centreOf(item) < boundary).length;
    const right = items.length - left;
    return left / items.length >= MIN_COLUMN_SHARE && right / items.length >= MIN_COLUMN_SHARE;
  });
}

function centreOf(item: PositionedItem): number {
  return item.x + item.width / 2;
}

/**
 * Section labels, for recognising a label column. Kept here rather than
 * imported from the profile extractor: this is a judgement about page
 * geometry — "that narrow strip is a row of headings" — not about what the
 * headings mean.
 */
const LABEL_PATTERN =
  /^(about\s*me|contact(\s*me)?|profile|summary|skills?|technical skills|competenties|vaardigheden|comp[ée]tences|experience|work experience|professional experience|werkervaring|ervaring|exp[ée]rience|education|opleiding(en)?|studies|formation|languages?|talen|talenkennis|langues|certifications?|certificaten|certificats|references?|referenties|r[ée]f[ée]rences?|interests|hobbies)\s*:?$/i;

/**
 * A label column holds at most this share of the page's runs. Section labels
 * are a handful of words beside large blocks of text, so a "column" holding
 * much more than this is real content, not labels.
 */
const MAX_LABEL_COLUMN_SHARE = 0.2;

/**
 * Nearly everything in the left margin must be a label for the strip to be
 * a label column rather than a sidebar with content of its own.
 */
const MIN_MARGIN_LABEL_PURITY = 0.8;

interface RenderedLine {
  text: string;
  y: number;
}

/** Group a column's runs into lines, keeping each line's vertical position. */
function toLines(items: PositionedItem[]): RenderedLine[] {
  if (items.length === 0) return [];

  const textHeight = median(items.map((item) => item.height).filter((height) => height > 0)) || 8;
  const tolerance = textHeight * LINE_TOLERANCE_RATIO;
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);

  const grouped: PositionedItem[][] = [];
  for (const item of sorted) {
    const current = grouped.at(-1);
    if (current && Math.abs(current[0].y - item.y) <= tolerance) current.push(item);
    else grouped.push([item]);
  }

  return grouped
    .map((line) => {
      const ordered = [...line].sort((a, b) => a.x - b.x);
      let rendered = "";
      let previousRight: number | null = null;
      for (const item of ordered) {
        if (previousRight !== null && item.x - previousRight > textHeight * SPACE_GAP_RATIO) {
          rendered += " ";
        }
        rendered += item.text;
        previousRight = item.x + item.width;
      }
      return { text: rendered.trim(), y: line[0].y };
    })
    .filter((line) => line.text.length > 0);
}

/**
 * Place each label from a label column beside the block of content it
 * introduces.
 *
 * The naive placements both fail. Merging by baseline puts the label
 * *inside* its own block — real documents set the label vertically centred
 * against the block, so `EXPERIENCE` shares a baseline with the third line
 * of the first role. Emitting the label column first puts all the headings
 * together, divorced from everything they label.
 *
 * Blocks are what makes it work: content lines separated by a larger than
 * usual vertical gap are one block, and a label belongs to the block its
 * baseline falls inside. That places `EXPERIENCE` above the first role
 * rather than three lines into it.
 */
function mergeLabelsIntoContent(labels: RenderedLine[], content: RenderedLine[]): string[] {
  if (content.length === 0) return labels.map((label) => label.text);

  const gaps: number[] = [];
  for (let index = 1; index < content.length; index += 1) {
    gaps.push(content[index - 1].y - content[index].y);
  }
  const typicalGap = median(gaps.filter((gap) => gap > 0)) || 12;
  const blockBreak = typicalGap * 1.8;

  // Blocks, as index ranges into `content`.
  const blocks: { start: number; end: number; top: number; bottom: number }[] = [];
  let start = 0;
  for (let index = 1; index <= content.length; index += 1) {
    const isBreak =
      index === content.length || content[index - 1].y - content[index].y > blockBreak;
    if (!isBreak) continue;
    blocks.push({
      start,
      end: index - 1,
      top: content[start].y,
      bottom: content[index - 1].y,
    });
    start = index;
  }

  const insertions = new Map<number, string[]>();
  for (const label of labels) {
    const containing =
      blocks.find((block) => label.y <= block.top && label.y >= block.bottom) ??
      // No block contains it — attach to the nearest one below, which is the
      // one a reader would take it to introduce.
      blocks.find((block) => block.top <= label.y) ??
      blocks[0];

    const at = containing?.start ?? 0;
    insertions.set(at, [...(insertions.get(at) ?? []), label.text]);
  }

  const output: string[] = [];
  content.forEach((line, index) => {
    for (const label of insertions.get(index) ?? []) output.push(label);
    output.push(line.text);
  });
  return output;
}

/** Group a column's runs into lines and render them top to bottom. */
function renderColumn(items: PositionedItem[]): string {
  if (items.length === 0) return "";

  const textHeight = median(items.map((item) => item.height).filter((height) => height > 0)) || 8;
  const tolerance = textHeight * LINE_TOLERANCE_RATIO;

  // Descending y: PDF's origin is the bottom-left, so a larger y is nearer
  // the top of the page.
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: PositionedItem[][] = [];
  for (const item of sorted) {
    const current = lines.at(-1);
    if (current && Math.abs(current[0].y - item.y) <= tolerance) current.push(item);
    else lines.push([item]);
  }

  return lines
    .map((line) => {
      const ordered = [...line].sort((a, b) => a.x - b.x);
      let rendered = "";
      let previousRight: number | null = null;

      for (const item of ordered) {
        // pdf.js splits a visual line into several runs, sometimes mid-word.
        // Only a real horizontal gap becomes a space; otherwise the runs are
        // joined as they appear on the page.
        if (previousRight !== null && item.x - previousRight > textHeight * SPACE_GAP_RATIO) {
          rendered += " ";
        }
        rendered += item.text;
        previousRight = item.x + item.width;
      }
      return rendered.trim();
    })
    .filter((line) => line.length > 0)
    .join("\n");
}

/**
 * Render one page's runs in reading order.
 *
 * Columns are emitted left to right, each read fully top to bottom. That is
 * what a person does with a sidebar-plus-body CV, and — more importantly for
 * parsing — it keeps every heading contiguous with the content beneath it.
 */
export function reconstructPage(items: PositionedItem[], pageWidth: number): string {
  const usable = items.filter((item) => item.text.trim().length > 0);
  if (usable.length === 0) return "";

  // Margin labels are looked for *before* columns, not after. A label strip
  // is identified precisely — left-aligned headings, each sharing a baseline
  // with body text, and nothing else in the margin. The column detector, given
  // the same strip, sees an ordinary narrow column and emits every heading
  // together in one block, divorced from the content each one labels. On a
  // short document the strip can clear the column-share floor, so leaving
  // this second would be a coin toss decided by document length.
  const marginLabels = detectMarginLabels(usable, pageWidth);
  if (marginLabels.labels.length > 0) {
    return mergeLabelsIntoContent(
      toLines(marginLabels.labels),
      toLines(marginLabels.rest),
    ).join("\n");
  }

  const boundaries = detectColumnBoundaries(usable, pageWidth);
  if (boundaries.length === 0) return renderColumn(usable);

  const edges = [0, ...boundaries, Number.POSITIVE_INFINITY];
  const columns: string[] = [];
  for (let index = 0; index < edges.length - 1; index += 1) {
    const column = usable.filter((item) => {
      const centre = centreOf(item);
      return centre >= edges[index] && centre < edges[index + 1];
    });
    const rendered = renderColumn(column);
    if (rendered.length > 0) columns.push(rendered);
  }
  return columns.join("\n");
}

/** Render a whole document, page by page. */
export function reconstructReadingOrder(pages: { items: PositionedItem[]; width: number }[]): string {
  return pages
    .map((page) => reconstructPage(page.items, page.width))
    .filter((page) => page.length > 0)
    .join("\n");
}

/**
 * Find a narrow column of section labels beside the body text.
 *
 * Deliberately separate from `detectColumnBoundaries`, and deliberately not
 * a matter of loosening its thresholds. Those thresholds exist to stop a
 * page number or a stray indent becoming a column, and relaxing them would
 * let both through. This asks a different question — is there a strip
 * holding little text, nearly all of which reads as a section heading? —
 * and only a real label column answers yes.
 */
export function detectMarginLabels(
  items: PositionedItem[],
  pageWidth: number,
): { labels: PositionedItem[]; rest: PositionedItem[] } {
  const none = { labels: [], rest: items };
  if (items.length < 8) return none;

  const leftEdge = Math.min(...items.map((item) => item.x));
  const marginWidth = pageWidth * 0.12;
  const textHeight = median(items.map((item) => item.height).filter((height) => height > 0)) || 8;

  const labels = items.filter((item) => {
    if (!LABEL_PATTERN.test(item.text.trim())) return false;
    // Aligned to the left margin. This is what rules out the ordinary word
    // "experience" sitting mid-sentence in the body, which otherwise reads
    // as a section label and drags the whole geometry with it.
    if (item.x > leftEdge + marginWidth) return false;
    // And sharing its baseline with text further right. A heading on a line
    // of its own is an ordinary heading and needs no special handling; one
    // with body text beside it is a margin label.
    return items.some(
      (other) =>
        other !== item &&
        Math.abs(other.y - item.y) <= textHeight * LINE_TOLERANCE_RATIO &&
        other.x > item.x + item.width,
    );
  });

  if (labels.length < 2) return none;
  if (labels.length / items.length > MAX_LABEL_COLUMN_SHARE) return none;

  // The margin must hold labels and essentially nothing else. This is what
  // separates a label strip from a real sidebar: a sidebar's headings also
  // share baselines with the body column, but it carries its own content
  // too, and pulling its headings out would wreck the column handling that
  // makes those documents readable.
  const inMargin = items.filter((item) => item.x <= leftEdge + marginWidth);
  if (labels.length / inMargin.length < MIN_MARGIN_LABEL_PURITY) return none;

  const labelSet = new Set(labels);
  return { labels, rest: items.filter((item) => !labelSet.has(item)) };
}
