import { checkVisualAccessibility, VISUAL_DIRECTOR_ACCENTS, VISUAL_DIRECTOR_BACKGROUNDS } from "./visual-accessibility";
import type { TIMELINE_LAYOUTS } from "../schemas";

type TimelineLayout = (typeof TIMELINE_LAYOUTS)[number];

/**
 * Deterministic layout/theme heuristics for the visual director (TLAI-006).
 * Pure function of a content summary — same input always produces the same
 * 2-3 candidates in the same order, satisfying "recommendations are
 * reproducible in fixture mode." AI involvement (a real provider) is
 * optional and, if used, may only choose *among* these candidates and
 * supply prose rationale — it never invents a layout or color value itself.
 */

export interface ContentSummary {
  eventCount: number;
  hasDurations: boolean; // any event has both startAt and endAt
  hasManyBranches: boolean; // layout-relevant: roadmap/gantt-shaped content
  avgDescriptionLength: number;
}

export interface VisualDirectionCandidate {
  layout: TimelineLayout;
  backgroundId: string;
  accentId: string;
  density: "compact" | "comfortable" | "spacious";
  cardStyle: "flat" | "elevated" | "outlined";
  rationale: string;
  /** Echoes the inputs this candidate was derived from, so a recommendation is auditable/reproducible, not a black box. */
  inputsUsed: ContentSummary;
}

const LIGHT_ACCENTS = VISUAL_DIRECTOR_ACCENTS.filter((a) => a.id.endsWith("-light")).map((a) => a.id);
const DARK_ACCENTS = VISUAL_DIRECTOR_ACCENTS.filter((a) => !a.id.endsWith("-light")).map((a) => a.id);

function densityFor(eventCount: number): "compact" | "comfortable" | "spacious" {
  if (eventCount > 40) return "compact";
  if (eventCount < 8) return "spacious";
  return "comfortable";
}

function buildCandidate(
  layout: TimelineLayout,
  backgroundId: "paper" | "midnight",
  accentIndex: number,
  cardStyle: VisualDirectionCandidate["cardStyle"],
  rationale: string,
  content: ContentSummary
): VisualDirectionCandidate | null {
  const accentPool = backgroundId === "midnight" ? LIGHT_ACCENTS : DARK_ACCENTS;
  const accentId = accentPool[accentIndex % accentPool.length]!;
  const density = densityFor(content.eventCount);

  const violations = checkVisualAccessibility({
    backgroundId,
    accentId,
    layout,
    density,
    eventCount: content.eventCount,
  });
  if (violations.length > 0) return null; // dropped, not surfaced with a warning — see visual-accessibility.ts

  return { layout, backgroundId, accentId, density, cardStyle, rationale, inputsUsed: content };
}

/**
 * Returns 2-3 candidates. Every returned candidate has already passed
 * checkVisualAccessibility — a candidate that would fail is simply never
 * constructed, so there's no filtering step downstream that could be
 * skipped by mistake.
 */
export function recommendVisualDirections(content: ContentSummary): VisualDirectionCandidate[] {
  const candidates: VisualDirectionCandidate[] = [];

  const primaryLayout = content.hasManyBranches ? "roadmap" : content.hasDurations ? "gantt" : "vertical";
  const primary = buildCandidate(
    primaryLayout,
    "paper",
    0,
    "elevated",
    `${content.eventCount} events${content.hasDurations ? " with durations" : ""}${content.hasManyBranches ? " and branching structure" : ""} suit a "${primaryLayout}" layout most closely.`,
    content
  );
  if (primary) candidates.push(primary);

  const alt = buildCandidate(
    "vertical",
    "paper",
    1,
    content.avgDescriptionLength > 200 ? "outlined" : "flat",
    `A straightforward vertical read${content.avgDescriptionLength > 200 ? ", outlined cards giving longer descriptions room to breathe" : ""}.`,
    content
  );
  if (alt) candidates.push(alt);

  const dark = buildCandidate(
    primaryLayout,
    "midnight",
    0,
    "flat",
    "The same structure in a dark theme, for presentation or low-light reading.",
    content
  );
  if (dark) candidates.push(dark);

  return candidates.slice(0, 3);
}
