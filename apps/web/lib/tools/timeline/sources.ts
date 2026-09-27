import { toUnits } from "../test-plan/sources";

/**
 * Splits the visitor's text into numbered sentences (S1, S2, …). The server
 * builds the prompt from these, checks every citation and every quoted date
 * against them, and the UI quotes them next to each event.
 *
 * Deterministic and shared by client and server.
 */
export interface TimelineSource {
  id: string;
  text: string;
}

export const MAX_SENTENCES = 150;
const MAX_SENTENCE_CHARS = 600;

export function splitSentences(text: string): TimelineSource[] {
  const sentences = toUnits(text).flatMap(sentencesOf);
  return sentences.slice(0, MAX_SENTENCES).map((s, i) => ({ id: `S${i + 1}`, text: s.slice(0, MAX_SENTENCE_CHARS) }));
}

/** Common abbreviations that end in a full stop but don't end a sentence. */
const ABBREVIATION = /(?:\b(?:c|ca|approx|St|Mr|Mrs|Ms|Dr|Prof|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|vs|etc|e\.g|i\.e|No)\.)$/i;

function sentencesOf(line: string): string[] {
  const parts: string[] = [];
  let current = "";
  for (const piece of line.split(/(?<=[.!?])\s+(?=["'“(\[]?[A-Z0-9])/)) {
    current = current ? `${current} ${piece}` : piece;
    if (!ABBREVIATION.test(current)) {
      parts.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts.filter(Boolean);
}
