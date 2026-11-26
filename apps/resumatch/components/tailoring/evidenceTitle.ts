import { MAX_EVIDENCE_TITLE_CHARS } from "../../lib/evidence/contract";

/** The evidence title, from the candidate's own words only: their first
 *  sentence, shortened. Never the posting's requirement text, which would
 *  then read as something they confirmed (#948 review). */
export function evidenceTitleFrom(detail: string): string {
  const first = detail.trim().split(/(?<=[.!?])\s+/)[0] ?? "";
  const words = first.replace(/[.!?]+$/, "").replace(/\s+/g, " ").trim();
  if (words.length <= MAX_EVIDENCE_TITLE_CHARS) return words;
  const cut = words.slice(0, MAX_EVIDENCE_TITLE_CHARS - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 1)).trimEnd()}…`;
}
