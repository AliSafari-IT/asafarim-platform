/**
 * The limits on a hand-edited skills paragraph (./handEdit.ts). Pure and
 * client-safe: the editor on the CV preview shows the same problems the
 * save would refuse, before it asks.
 */

/** Stored and printed, so it stays a paragraph, not a page. The AI's
 *  paragraph and a hand edit share it (./prompts.ts re-exports it). */
export const MAX_SKILLS_PARAGRAPH_LENGTH = 1500;

/** One paragraph: line breaks and runs of spaces become single spaces. */
export function normalizeHandEditedParagraph(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** The same limits the save applies, for the editor to show before it asks. */
export function handEditProblem(text: string): "empty" | "too_long" | null {
  const paragraph = normalizeHandEditedParagraph(text);
  if (!paragraph) return "empty";
  if (paragraph.length > MAX_SKILLS_PARAGRAPH_LENGTH) return "too_long";
  return null;
}

