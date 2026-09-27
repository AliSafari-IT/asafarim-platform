/**
 * Splits the visitor's requirement text into numbered source units
 * (R1, R2, …). The server builds the prompt from these units and validates
 * every scenario's references against them, and the UI shows the quoted
 * unit next to each scenario — so traceability never depends on the model
 * inventing or copying ids correctly.
 *
 * Deterministic and shared by client and server.
 */
export interface SourceUnit {
  id: string;
  text: string;
  /** Which field it came from, for display. */
  field: "requirement" | "acceptanceCriteria";
}

export const MAX_SOURCE_UNITS = 60;
const MAX_UNIT_CHARS = 400;

export function splitSources(requirement: string, acceptanceCriteria?: string): SourceUnit[] {
  const units: SourceUnit[] = [];
  const push = (text: string, field: SourceUnit["field"]) => {
    if (units.length >= MAX_SOURCE_UNITS) return;
    units.push({ id: `R${units.length + 1}`, text: text.slice(0, MAX_UNIT_CHARS), field });
  };
  for (const unit of toUnits(requirement)) push(unit, "requirement");
  for (const unit of toUnits(acceptanceCriteria ?? "")) push(unit, "acceptanceCriteria");
  return units;
}

/** Splits free text into trimmed lines (list markers removed), long lines by sentence. */
export function toUnits(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(stripListMarker)
    .filter(Boolean)
    .flatMap(splitLongLine);
}

function stripListMarker(line: string): string {
  // Repeat so combined markers like "- [x] " are fully removed.
  let text = line.trim();
  for (let previous = ""; previous !== text; ) {
    previous = text;
    text = text.replace(/^(?:[-*•–]|\d+[.)]|[a-z][.)]|\[[ xX]?\])\s+/, "").trim();
  }
  return text;
}

/** Lines that hold several sentences become one unit per sentence. */
function splitLongLine(line: string): string[] {
  if (line.length <= 160) return [line];
  const sentences = line.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) ?? [line];
  return sentences.map((s) => s.trim()).filter(Boolean);
}
