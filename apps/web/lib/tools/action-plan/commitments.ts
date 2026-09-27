/**
 * Detects the two things this tool must never add on its own (#676):
 * deadlines and assignees. Used by the server to reject model output that
 * slips them into free text (the schemas have no field for either), and by
 * tests and the eval cases as the adversarial check.
 *
 * Deliberately conservative: a false positive costs one dropped task, which
 * the visitor is told about; a false negative silently commits a person or a
 * date. Detection is text-based, so it's a guard, not a proof.
 */

const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const WEEKDAY = "(?:mon|tues|wednes|thurs|fri|satur|sun)day";
const RELATIVE = `(?:${WEEKDAY}|tomorrow|tonight|today|eod|eow|cob|q[1-4]|(?:the\\s+)?end\\s+of\\s+(?:the\\s+)?(?:day|week|month|quarter|sprint|year)|next\\s+(?:week|month|quarter|sprint|year)|this\\s+(?:week|month|quarter|sprint))`;

const DEADLINE_PATTERNS: RegExp[] = [
  /\b\d{4}-\d{1,2}-\d{1,2}\b/i,
  /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/,
  new RegExp(`\\b${MONTH}\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, "i"),
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH}\\b`, "i"),
  new RegExp(`\\b(?:by|before|due|until|no\\s+later\\s+than)\\s+(?:${RELATIVE}|${MONTH})\\b`, "i"),
  /\b(?:deadline|due\s+date|due\s+(?:on|by))\b/i,
  /\b(?:eod|eow|cob)\b/i,
  /\bwithin\s+\d+\s+(?:hours?|days?|weeks?|months?)\b/i,
];

const ROLE_WORDS = /\b(?:assign(?:ed|ee|ment)?|owner|owned\s+by|ownership|responsible|accountable|dri|point\s+person)\b/i;
const MENTION = /(?:^|\s)@[\w.-]+/;
/** "Sam to draft…", "Sam: draft…", "Priya will…" at the start of a task. */
const LEADING_NAME = /^\s*[A-Z][a-z]+(?:\s[A-Z][a-z]+)?\s*(?::|\b(?:to|will|should|must|needs\s+to|is\s+going\s+to|owns|handles|takes)\b)/;

export type Commitment = { kind: "deadline" | "assignee"; phrase: string };

export function findDeadline(text: string): string | null {
  for (const pattern of DEADLINE_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[0].trim();
  }
  return null;
}

/**
 * `names` are the participants the visitor listed; any of them followed by
 * ownership language anywhere in the text counts as an assignment.
 */
export function findAssignee(text: string, names: readonly string[] = []): string | null {
  const role = text.match(ROLE_WORDS) ?? text.match(MENTION) ?? text.match(LEADING_NAME);
  if (role) return role[0].trim();
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`\\b${escaped}\\s+(?:to|will|should|must|owns|handles|takes|is\\s+(?:handling|taking|doing))\\b`, "i"));
    if (match) return match[0];
  }
  return null;
}

/**
 * Commitments in `text` that the cited evidence doesn't contain. A deadline
 * quoted from the notes ("launch is on 3 October") is a fact and may be
 * repeated; one the model made up is not. Assignees are never allowed on a
 * task or milestone, even when a name appears in the notes.
 */
export function unsupportedCommitment(text: string, evidence: string, names: readonly string[] = []): Commitment | null {
  const assignee = findAssignee(text, names);
  if (assignee) return { kind: "assignee", phrase: assignee };
  const deadline = findDeadline(text);
  if (deadline && !normalize(evidence).includes(normalize(deadline))) return { kind: "deadline", phrase: deadline };
  return null;
}

/** Capitalised names from the participants field ("Sam (PM), Priya — design"). */
export function participantNames(participants: string | undefined): string[] {
  if (!participants) return [];
  return [...new Set(participants.match(/\b[A-Z][a-z]{1,30}\b/g) ?? [])];
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ");
}
