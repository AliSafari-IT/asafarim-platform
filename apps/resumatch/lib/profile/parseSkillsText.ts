/**
 * Line-by-line skill parsing, shared between the PDF/DOCX extraction path
 * (lib/extraction/profileExtractor.ts's `extractSkills`) and the profile
 * editor's manual Skills textarea (app/profile/ProfileWorkbench.tsx).
 *
 * Those two paths used to be entirely separate: extraction filtered prose
 * out and (after the fix for #481) recovered category headings and
 * "Term: description" bullets; the manual textarea just split on commas
 * and newlines and stored every fragment verbatim. That split-brain design
 * meant a candidate who pasted a formatted skills block — copied straight
 * out of the same CV a PDF upload would have parsed intelligently — got
 * garbage entries instead: bullet glyphs and bare category labels stored
 * as "skills", and a full description sentence over `skillSchema.name`'s
 * 80-char cap failing the whole profile save with a validation error (the
 * same failure class #478 fixed for education dates). Sharing one parser
 * means typing or pasting either way gets the same, better result.
 *
 * No framework or Node-only dependency here on purpose: this file is safe
 * to import from a Client Component (the profile editor) as well as from
 * server-side extraction, so keep it that way — see #471's server-only
 * leak for what goes wrong when a shared module isn't actually shared-safe.
 */

/** Strip a leading bullet glyph (and the whitespace after it) from a line —
 *  the same set `splitList` strips per-segment — so heading and lead-in
 *  detection see the same text a split-list item would. */
function stripBulletPrefix(line: string): string {
  return line.replace(/^[-*•·➢▶►❖]\s*/, "").trim();
}

/** Splits a line into list items on the separators CVs actually use. */
function splitList(line: string): string[] {
  return line
    .split(/[,;|/]|\s{2,}|•|·|\s-\s/)
    .map((part) => part.trim().replace(/^[-*•·➢▶►❖]\s*/, "").trim())
    .filter((part) => part.length > 1 && part.length <= 80);
}

/**
 * Whether a fragment is plausibly the name of a skill.
 *
 * Without this, a prose bullet like "Database Management: Used MongoDB and
 * SQL Server to design, query, and manage databases effectively" is split on
 * its commas and stored as three "skills". A skill is a short noun phrase; a
 * sentence, a URL, an email, or a date is not, whatever section it sat under.
 */
export function looksLikeSkill(candidate: string): boolean {
  const value = candidate.trim();
  if (value.length < 2 || value.length > 50) return false;
  // Ends like a sentence.
  if (/[.:;!?]$/.test(value)) return false;
  if (value.split(/\s+/).length > 5) return false;
  // Contact details and links appear in every CV and are not skills.
  if (/@|https?:|www\./i.test(value)) return false;
  if (/\b(19|20)\d{2}\b/.test(value)) return false;
  // Connectives mark prose. Short fragments are spared so "Ruby on Rails"
  // and "Test of Record" survive.
  if (
    value.split(/\s+/).length > 3 &&
    /\b(and|with|the|for|to|of|in|using|used|van|voor|met|et|des|pour)\b/i.test(value)
  ) {
    return false;
  }
  return /[a-z]/i.test(value);
}

/**
 * Whether a line is a skills-section subheading rather than a skill or a
 * bulleted item — "Software Development:", "Version Control:" — a short
 * label with nothing else on the line. Distinguished from a "Term:
 * description" bullet (see `extractLeadInSkill`) by having no non-trivial
 * text after its own colon.
 */
function looksLikeSkillCategoryHeading(line: string): string | null {
  const stripped = stripBulletPrefix(line);
  const match = /^([A-Za-z][\w &/-]{1,38}):\s*$/.exec(stripped);
  if (!match) return null;
  const label = match[1].trim();
  if (label.split(/\s+/).length > 5) return null;
  return label;
}

/**
 * A section title a candidate might copy-paste along with the content
 * beneath it — "Skills" being the obvious one, since it is also this
 * field's own label. Unlike a category heading (`looksLikeSkillCategoryHeading`)
 * this never has its own colon, so it needs a separate, narrow check
 * rather than falling through to `splitList`/`looksLikeSkill`, which would
 * otherwise happily accept the bare word "Skills" as a skill name.
 */
function looksLikeSkillSectionTitle(line: string): boolean {
  const stripped = stripBulletPrefix(line);
  return /^(skills?|skill set|technical skills|core competenc(?:y|ies)|competenc(?:y|ies))$/i.test(stripped);
}

/**
 * Recover the skill name from a "Term: longer description" bullet —
 * `".NET and C#: Proficient in .NET and C# environments, including..."` —
 * a format `looksLikeSkill` correctly rejects whole (it is a sentence, not
 * a skill name), but which names a real skill in its lead-in. Returns null
 * for anything that is not this specific shape, including a bare category
 * heading (see `looksLikeSkillCategoryHeading`, checked first by the
 * caller) and an ordinary "Skill: Skill, Skill" list some CVs also use,
 * where the text after the colon is itself short enough to look like more
 * skill names rather than prose.
 */
function extractLeadInSkill(line: string): string | null {
  const stripped = stripBulletPrefix(line);
  const match = /^([^:]{2,60}):\s+(.{15,})$/.exec(stripped);
  if (!match) return null;
  const [, leadIn, description] = match;
  // Prose reads like a sentence — connective words, or simply too long to
  // be "more skill names" the way "Skill: SkillA, SkillB" would be.
  const looksLikeProse =
    description.length > 40 || /\b(and|with|the|for|to|of|in|using|used)\b/i.test(description);
  if (!looksLikeProse) return null;
  const name = leadIn.trim();
  return looksLikeLeadInSkillName(name) ? name : null;
}

/**
 * A lighter check than `looksLikeSkill`, used only for a lead-in already
 * confirmed structurally (by the colon-plus-prose-description shape above)
 * to be a deliberate label, not a guess at an arbitrary comma-split
 * fragment of a sentence. `looksLikeSkill`'s "more than 3 words containing
 * a connective" rejection exists for that guess — it would otherwise
 * reject a perfectly real compound skill name like "React and Angular
 * TypeScript" or "Testing and Quality Assurance" for the same reason it
 * correctly rejects an actual sentence fragment. The lead-in's own source
 * (a short label immediately before a colon) is evidence enough on its
 * own; this only guards against the genuinely wrong shapes — too long for
 * `skillSchema.name`'s 80-char cap, ending like a sentence itself, a
 * contact detail, or a bare date.
 */
function looksLikeLeadInSkillName(name: string): boolean {
  const value = name.trim();
  if (value.length < 2 || value.length > 80) return false;
  if (/[.:;!?]$/.test(value)) return false;
  if (/@|https?:|www\./i.test(value)) return false;
  if (/\b(19|20)\d{2}\b/.test(value)) return false;
  return /[a-z]/i.test(value);
}

export interface ParsedSkillLine {
  name: string;
  /** The subheading this skill sat under, if any — see
   *  `looksLikeSkillCategoryHeading`. Null when the line had none. */
  category: string | null;
}

/**
 * Parse skill lines (already split one-per-array-entry — a PDF's own
 * section lines, or a textarea's value split on "\n") into deduplicated
 * skill/category pairs. A bare "Label:" line sets the category for every
 * skill parsed after it until the next one; a "Term: description" bullet
 * recovers just its lead-in term; anything else falls through to the
 * original comma/bullet-separated list behavior. Capped at 200 — the same
 * limit `skillSchema` and the profile editor already enforce.
 */
export function parseSkillLines(lines: string[]): ParsedSkillLine[] {
  const seen = new Set<string>();
  const result: ParsedSkillLine[] = [];
  let currentCategory: string | null = null;

  const push = (name: string, category: string | null) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ name, category });
  };

  for (const line of lines) {
    if (result.length >= 200) return result;

    if (looksLikeSkillSectionTitle(line)) continue;

    const heading = looksLikeSkillCategoryHeading(line);
    if (heading) {
      currentCategory = heading;
      continue;
    }

    const leadIn = extractLeadInSkill(line);
    if (leadIn) {
      push(leadIn, currentCategory);
      continue;
    }

    for (const item of splitList(line)) {
      if (!looksLikeSkill(item)) continue;
      push(item, currentCategory);
      if (result.length >= 200) break;
    }
  }
  return result;
}

/** Convenience wrapper for a raw textarea value — the profile editor's
 *  manual Skills field, which is free-typed text, not pre-split section
 *  lines. Splits on newlines only; commas within a line are still handled
 *  by `parseSkillLines`'s own fallback path, so "React, Node.js,
 *  PostgreSQL" typed on one line keeps working exactly as before. */
export function parseSkillsFreeText(raw: string): ParsedSkillLine[] {
  return parseSkillLines(raw.split(/\n/));
}
