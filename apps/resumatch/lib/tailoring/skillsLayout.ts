import { groupSkillsByCategory, type SkillGroup } from "../profile/skillCategories";

/**
 * How a tailored CV shows its skills. Three layouts, the ones IT CVs use
 * most:
 *
 * - `grouped`: one line per category ("Backend & APIs: ASP.NET Core,
 *   Node.js"). The candidate's own category choices on the profile win over
 *   the keyword default.
 * - `columns`: a compact list in three columns, no headings.
 * - `paragraph`: a short, fact-based paragraph an AI writes on request from
 *   this CV's own skills (lib/tailoring/ai/skillsParagraph). It is checked
 *   before it is stored, and never replaces the skill list in the data.
 *
 * The choice is stored per CV (`TailoredResume.skillsLayout`). Null is the
 * automatic choice: grouped when most skills fit a category, otherwise
 * columns, so a CV outside IT (a nurse, a teacher) never shows nearly every
 * skill under one "Other" heading. This module is the one place that turns
 * the stored choice into what the preview, the PDF and the DOCX render, so
 * the three can't disagree.
 */
export const SKILLS_LAYOUTS = ["grouped", "columns", "paragraph"] as const;
export type SkillsLayout = (typeof SKILLS_LAYOUTS)[number];

export function isSkillsLayout(value: unknown): value is SkillsLayout {
  return typeof value === "string" && (SKILLS_LAYOUTS as readonly string[]).includes(value);
}

export type SkillsDisplay =
  | { layout: "grouped"; groups: SkillGroup[] }
  | { layout: "columns"; skills: string[] }
  | { layout: "paragraph"; paragraph: string };

export interface SkillsDisplayInput {
  skills: string[];
  /** The stored choice; anything that isn't a known layout counts as null. */
  layout: string | null | undefined;
  paragraph: string | null | undefined;
  /** The candidate's own category for a skill (profile `SkillEntry.category`). */
  categoryOf?: (name: string) => string | null | undefined;
}

/**
 * Skill groups for a CV. Unlike the profile editor, which lists categories
 * in a fixed order, a CV lists them by relevance: a group's place is its
 * first skill's place in the CV's skill order, which tailoring already
 * ordered for the job. "Other" always comes last.
 */
export function groupSkillsForCv(
  skills: string[],
  categoryOf?: (name: string) => string | null | undefined,
  options?: { collapseUnrecognized?: boolean },
): SkillGroup[] {
  const position = new Map(skills.map((name, index) => [name, index] as const).reverse());
  const first = (group: SkillGroup) =>
    group.category === "Other" ? Number.MAX_SAFE_INTEGER : Math.min(...group.skills.map((name) => position.get(name) ?? 0));
  return groupSkillsByCategory(skills, categoryOf, options)
    .map((group) => ({ group, at: first(group) }))
    .sort((a, b) => a.at - b.at)
    .map(({ group }) => group);
}

/** The layout the CV is actually shown in, for the selector's value. */
export function effectiveSkillsLayout(input: SkillsDisplayInput): SkillsLayout {
  return resolveSkillsDisplay(input)?.layout ?? "grouped";
}

/**
 * What to render, or null when the CV has no skills. A `paragraph` choice
 * with no stored paragraph yet (the AI call failed, or it is still being
 * written) shows the grouped list rather than an empty section.
 */
export function resolveSkillsDisplay(input: SkillsDisplayInput): SkillsDisplay | null {
  const { skills, categoryOf } = input;
  if (skills.length === 0) return null;
  const layout = isSkillsLayout(input.layout) ? input.layout : null;

  if (layout === "paragraph") {
    const paragraph = input.paragraph?.trim();
    if (paragraph) return { layout: "paragraph", paragraph };
    return { layout: "grouped", groups: groupSkillsForCv(skills, categoryOf) };
  }
  if (layout === "columns") return { layout: "columns", skills };
  if (layout === "grouped") return { layout: "grouped", groups: groupSkillsForCv(skills, categoryOf) };

  // Automatic: grouped only when the categories describe these skills.
  const automatic = groupSkillsForCv(skills, categoryOf, { collapseUnrecognized: true });
  if (automatic.length === 1 && automatic[0]!.category === "") return { layout: "columns", skills };
  return { layout: "grouped", groups: automatic };
}

/**
 * A name → category lookup from a stored profile version's raw content.
 * Read defensively (an old or odd row gives no overrides, never an error):
 * the category is only ever a display choice.
 */
export function profileSkillCategories(profileContent: unknown): (name: string) => string | null {
  const map = new Map<string, string>();
  const skills = (profileContent as { skills?: unknown } | null)?.skills;
  if (Array.isArray(skills)) {
    for (const skill of skills) {
      if (!skill || typeof skill !== "object") continue;
      const { name, category } = skill as { name?: unknown; category?: unknown };
      if (typeof name === "string" && typeof category === "string" && category.trim()) {
        map.set(name.trim().toLowerCase(), category.trim());
      }
    }
  }
  return (name) => map.get(name.trim().toLowerCase()) ?? null;
}
