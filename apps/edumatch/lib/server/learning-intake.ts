/**
 * Conversational intake — turning "I don't get quadratic equations" into a
 * structured understanding of the learning need.
 *
 * Responsibilities, in the order the journey runs them:
 *   1. Understand   — extract brief fields from everything said so far.
 *   2. Clarify      — decide the single next question (delegated to
 *                     learning-brief.ts, which owns the interview script).
 *   3. Help now     — an explanation, a worked example, and next steps,
 *                     produced *before* tutors are ever mentioned.
 *   4. Triage       — self-study, tutor, or one more diagnostic step.
 *
 * Two rules shape the implementation:
 *
 * - **Never pretend to understand the level.** The model may only *report*
 *   what the student said. Every extracted field is re-validated against the
 *   brief schema and merged conservatively (see mergeBriefFields): a model
 *   that hallucinates a school year cannot overwrite one the student gave,
 *   and confidence is recomputed from filled fields, not from the model.
 *
 * - **Degrade to useful, not to broken.** With no provider configured (local
 *   dev, CI, tests) extraction falls back to a deterministic keyword pass so
 *   the whole flow — questions, brief, matching, proposals — still works end
 *   to end. The fallback is honest about knowing less: it fills only what it
 *   can actually see in the text, which means more follow-up questions, not
 *   invented answers.
 */

import { toBaseLanguage } from "@asafarim/shared-i18n";
import {
  buildVisionContent,
  generateWithAnthropic,
  generateWithOpenAI,
} from "./ai-orchestrator";
import {
  briefFieldsSchema,
  type BriefFields,
  type TriageOutcome,
  TRIAGE_OUTCOMES,
} from "./learning-brief";
import { GRADE_LEVELS, type GradeLevel } from "./validation";

export const INTAKE_PROMPT_VERSION = "brief-v1";

export type IntakeTurnView = {
  role: "STUDENT" | "ASSISTANT";
  kind: "MESSAGE" | "QUESTION" | "HELP" | "SUMMARY";
  content: string;
  field?: string | null;
};

/** What immediate help looks like before any tutor is proposed. */
export type ImmediateHelp = {
  /** A plain explanation of the concept, in the student's language. */
  explanation: string;
  /** One fully worked example, or empty when the topic isn't yet clear. */
  workedExample: string;
  /** Short diagnostic questions the student can try right now. */
  practiceQuestions: string[];
  /** Ordered study steps. */
  studySteps: string[];
  /** Topics the student likely needs underneath this one. */
  prerequisiteGaps: string[];
};

export type IntakeAnalysis = {
  fields: BriefFields;
  help: ImmediateHelp | null;
  triage: { outcome: TriageOutcome; rationale: string } | null;
  /** Which provider produced this, or "heuristic" when none was available. */
  source: "openai" | "anthropic" | "heuristic";
  model: string;
};

// ─── Prompting ────────────────────────────────────────────────────────────

export const EXTRACTION_SYSTEM_PROMPT = `You are EduMatch's learning-need analyst.

You read a conversation between a student and a learning assistant and return
STRICT JSON describing what is actually known. You never invent facts.

Return exactly one JSON object, no prose, no markdown fences, with this shape.
ANGLE BRACKETS mark placeholders describing the allowed form of a value. Never
copy a placeholder, or any value shown here, into your answer — every value you
return must come from the conversation.

{
  "fields": {
    "subject": string,                 // a school subject, as the student named it
    "topic": string,                   // the specific topic or chapter
    "educationalLevel": "K12" | "UNDERGRAD" | "GRAD",
    "schoolYear": string,              // as the student said it
    "learningObjective": string,       // what they want to be able to do
    "currentUnderstanding": string,    // what they already can do
    "difficulties": string[],          // specific, concrete blockers
    "prerequisiteGaps": string[],      // topics missing underneath
    "language": string,                // ISO 639-1, teaching language
    "mode": "ONLINE" | "IN_PERSON" | "EITHER",
    "locationCity": string,
    "availability": [{ "day": "<MON|TUE|WED|THU|FRI|SAT|SUN>", "from": "<HH:MM>", "to": "<HH:MM>" }],
    "deadlineAt": string,              // ISO 8601 date
    "deadlineKind": "EXAM" | "ASSIGNMENT" | "NONE",
    "accessibilityNeeds": string
  },
  "help": {
    "explanation": string,
    "workedExample": string,
    "practiceQuestions": string[],
    "studySteps": string[],
    "prerequisiteGaps": string[]
  },
  "triage": {
    "outcome": "SELF_STUDY" | "TUTOR_RECOMMENDED" | "NEEDS_DIAGNOSTIC",
    "rationale": string
  }
}

Rules:
- OMIT any field the student has not actually told you. An absent key is
  correct and expected; a guessed value is a bug. Never infer educationalLevel
  from the subject alone.
- "availability" is a COMPLETE restatement of when the student is free, not an
  addition to what you returned before. Return every window they still want and
  nothing else. If they correct or narrow their availability ("only Wednesdays"),
  return only the windows that survive the correction. Omit the key entirely if
  they have not said when they are free.
- "help" must teach, not solve graded work for the student. Explain the method,
  work a DIFFERENT example than the one they submitted, and give them practice.
  If the student is asking you to complete an assessment for them, omit "help"
  and set triage.outcome to "NEEDS_DIAGNOSTIC" with a rationale saying so.
- Choose SELF_STUDY when an explanation plus practice is plausibly enough.
  Choose TUTOR_RECOMMENDED when the gap is structural, the deadline is tight,
  or the student has already tried and stayed stuck.
  Choose NEEDS_DIAGNOSTIC when you cannot tell their level well enough to say.
- Write "help" in the student's language.`;

function conversationToText(turns: readonly IntakeTurnView[]): string {
  return turns
    .map((t) => {
      const who = t.role === "STUDENT" ? "Student" : "Assistant";
      return `${who}: ${t.content}`;
    })
    .join("\n");
}

function buildExtractionPrompt(
  turns: readonly IntakeTurnView[],
  known: BriefFields,
  localeHint?: string,
): string {
  const knownJson = JSON.stringify(serialiseKnown(known), null, 2);
  const localeLine = localeHint
    ? `The student's app is set to "${toBaseLanguage(localeHint)}". Use that as the language only if the conversation gives no clearer signal.`
    : "";

  return [
    "Conversation so far:",
    conversationToText(turns),
    "",
    "Already established (do not contradict without an explicit correction from the student):",
    knownJson,
    localeLine,
    "",
    "Return the JSON object now.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Dates don't survive JSON.stringify as anything the model should re-emit. */
function serialiseKnown(fields: BriefFields): Record<string, unknown> {
  return {
    ...fields,
    deadlineAt: fields.deadlineAt
      ? fields.deadlineAt.toISOString().slice(0, 10)
      : undefined,
  };
}

// ─── JSON parsing ─────────────────────────────────────────────────────────

/**
 * Models wrap JSON in prose and fences no matter how firmly you ask them not
 * to. Pull out the outermost object rather than trusting the whole response.
 */
export function extractJsonObject(raw: string): unknown | null {
  const trimmed = raw.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    return JSON.parse(withoutFence.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

function parseHelp(value: unknown): ImmediateHelp | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const str = (k: string) => (typeof v[k] === "string" ? (v[k] as string).trim() : "");
  const list = (k: string) =>
    Array.isArray(v[k])
      ? (v[k] as unknown[])
          .filter((x): x is string => typeof x === "string")
          .map((x) => x.trim())
          .filter(Boolean)
          .slice(0, 8)
      : [];

  const help: ImmediateHelp = {
    explanation: str("explanation"),
    workedExample: str("workedExample"),
    practiceQuestions: list("practiceQuestions"),
    studySteps: list("studySteps"),
    prerequisiteGaps: list("prerequisiteGaps"),
  };

  // Help with nothing in it is worse than no help — it renders as an empty
  // card that says "here's your explanation" above whitespace.
  const hasContent =
    help.explanation.length > 0 ||
    help.workedExample.length > 0 ||
    help.practiceQuestions.length > 0 ||
    help.studySteps.length > 0;
  return hasContent ? help : null;
}

function parseTriage(
  value: unknown,
): { outcome: TriageOutcome; rationale: string } | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const outcome = typeof v.outcome === "string" ? v.outcome.toUpperCase() : "";
  if (!(TRIAGE_OUTCOMES as readonly string[]).includes(outcome)) return null;
  return {
    outcome: outcome as TriageOutcome,
    rationale:
      typeof v.rationale === "string" ? v.rationale.trim().slice(0, 1000) : "",
  };
}

/**
 * Validate the model's `fields` object field-by-field rather than all at once.
 * One malformed entry (a bad date, an unknown level) should cost us that one
 * field, not the entire extraction.
 */
export function parseBriefFields(value: unknown): BriefFields {
  if (!value || typeof value !== "object") return {};
  const input = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(input)) {
    if (raw === null || raw === undefined || raw === "") continue;
    const single = briefFieldsSchema.pick({
      [key]: true,
    } as never);
    const parsed = single.safeParse({ [key]: raw });
    if (parsed.success) Object.assign(out, parsed.data);
  }

  return out as BriefFields;
}

// ─── Merging ──────────────────────────────────────────────────────────────

/**
 * List fields where a later turn genuinely *adds* to what we knew. A student
 * who names a second thing they're stuck on is still stuck on the first.
 *
 * Everything else that is a list — availability — is a restatement: it
 * describes a current state of the world, so the newest extraction replaces
 * the old one. Unioning it means a correction can never remove anything, which
 * is how "only on Wednesdays" ends up displayed as five Mondays and a
 * Wednesday.
 */
const ADDITIVE_LIST_FIELDS: ReadonlySet<keyof BriefFields> = new Set([
  "difficulties",
  "prerequisiteGaps",
]);

/**
 * A stable identity for de-duplication.
 *
 * `JSON.stringify` is not one: `{day,from,to}` and `{from,to,day}` describe the
 * same window but serialise differently, and a model has no obligation to emit
 * keys in the same order twice. Sorting keys makes the fingerprint depend on
 * the value rather than on how it happened to be written.
 */
export function valueFingerprint(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(valueFingerprint).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${valueFingerprint(v)}`);
    return `{${entries.join(",")}}`;
  }
  return String(value).trim().toLowerCase();
}

function dedupe(values: readonly unknown[]): unknown[] {
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const value of values) {
    const key = valueFingerprint(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

/**
 * Merge a freshly extracted set of fields onto what we already knew.
 *
 * Scalars: a new value wins only if we had nothing. The student can still
 * correct a field, but that goes through the explicit brief-edit path, not
 * through a model re-reading the transcript and quietly changing its mind on
 * turn six.
 *
 * Lists: additive fields union (de-duplicated); restatement fields are
 * replaced by any non-empty update, so a correction actually corrects. Both
 * paths de-duplicate, because a single extraction can repeat itself too.
 */
export function mergeBriefFields(
  known: BriefFields,
  update: BriefFields,
): BriefFields {
  const merged: BriefFields = { ...known };

  for (const [key, value] of Object.entries(update) as Array<
    [keyof BriefFields, unknown]
  >) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      const existing = (known[key] as unknown[] | undefined) ?? [];

      if (!ADDITIVE_LIST_FIELDS.has(key)) {
        // Restatement: an empty update means "the model said nothing this
        // turn", not "the student is never free". Keep what we had.
        if (value.length > 0) (merged[key] as unknown) = dedupe(value);
        continue;
      }

      const combined = dedupe([...existing, ...value]);
      if (combined.length === 0) continue;
      (merged[key] as unknown) = combined;
      continue;
    }

    const current = known[key];
    const currentIsEmpty =
      current === undefined ||
      current === null ||
      (typeof current === "string" && current.trim().length === 0);
    if (currentIsEmpty) (merged[key] as unknown) = value;
  }

  return merged;
}

// ─── Heuristic fallback ───────────────────────────────────────────────────

const SUBJECT_KEYWORDS: Array<[string, RegExp]> = [
  ["Mathematics", /\b(math|maths|mathematics|algebra|geometry|calculus|wiskunde|mathématiques|trigonometry)\b/i],
  ["Physics", /\b(physics|natuurkunde|physique|mechanics|thermodynamics)\b/i],
  ["Chemistry", /\b(chemistry|scheikunde|chimie|stoichiometry)\b/i],
  ["Biology", /\b(biology|biologie|genetics|photosynthesis)\b/i],
  ["English", /\b(english|engels|anglais|essay writing|grammar)\b/i],
  ["History", /\b(history|geschiedenis|histoire)\b/i],
  ["Geography", /\b(geography|aardrijkskunde|géographie)\b/i],
  ["Computer Science", /\b(programming|computer science|informatica|python|javascript|algorithms?)\b/i],
  ["Economics", /\b(economics|economie|micro-?economics|macro-?economics)\b/i],
];

const TOPIC_KEYWORDS: Array<[string, RegExp]> = [
  ["Quadratic equations", /\b(quadratic|vierkantsvergelijking|abc-?formule|second degree)\b/i],
  ["Linear equations", /\b(linear equations?|lineaire vergelijking)\b/i],
  ["Derivatives", /\b(derivative|differentiat|afgeleide)\w*/i],
  ["Integrals", /\b(integral|integrer|integraal)\w*/i],
  ["Fractions", /\b(fractions?|breuken)\b/i],
  ["Probability", /\b(probability|kansrekening|statistics)\b/i],
];

/**
 * Rule-based extraction for when no AI provider is configured. It reads only
 * what is unambiguously present — a named subject, a recognised topic, an
 * explicit mode preference, an explicit exam date. Everything else stays
 * empty, which routes the student to a follow-up question instead of a guess.
 */
export function heuristicExtract(text: string): BriefFields {
  const fields: BriefFields = {};

  for (const [subject, pattern] of SUBJECT_KEYWORDS) {
    if (pattern.test(text)) {
      fields.subject = subject;
      break;
    }
  }
  for (const [topic, pattern] of TOPIC_KEYWORDS) {
    if (pattern.test(text)) {
      fields.topic = topic;
      break;
    }
  }

  const level = detectLevel(text);
  if (level) fields.educationalLevel = level;

  if (/\b(online|remote|video call|op afstand)\b/i.test(text)) {
    fields.mode = "ONLINE";
  } else if (/\b(in person|in-person|at home|face to face|fysiek)\b/i.test(text)) {
    fields.mode = "IN_PERSON";
  }

  const exam = /\b(exam|test|toets|examen|proefwerk)\b/i.test(text);
  if (exam) fields.deadlineKind = "EXAM";

  // "in two weeks", "over 3 weken", "in 10 days"
  const relative = text.match(
    /\bin\s+(\d+|two|three|four|a)\s+(day|days|week|weeks|dag|dagen|weken|weke?n?)\b/i,
  );
  if (relative) {
    const words: Record<string, number> = { a: 1, two: 2, three: 3, four: 4 };
    const amountRaw = relative[1].toLowerCase();
    const amount = words[amountRaw] ?? Number.parseInt(amountRaw, 10);
    if (Number.isFinite(amount) && amount > 0 && amount < 60) {
      const isWeeks = /week|weken/i.test(relative[2]);
      const days = isWeeks ? amount * 7 : amount;
      fields.deadlineAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      if (!fields.deadlineKind) fields.deadlineKind = exam ? "EXAM" : "ASSIGNMENT";
    }
  }

  return fields;
}

function detectLevel(text: string): GradeLevel | undefined {
  if (/\b(phd|master'?s|graduate|msc|doctoral)\b/i.test(text)) return "GRAD";
  if (/\b(university|bachelor|undergrad(uate)?|college|bsc|hbo|wo)\b/i.test(text)) {
    return "UNDERGRAD";
  }
  if (
    /\b(secondary school|high school|middelbare school|grade\s*\d{1,2}|year\s*\d{1,2}|vwo|havo|vmbo|lyc[ée]e|gymnasium)\b/i.test(
      text,
    )
  ) {
    return "K12";
  }
  return undefined;
}

/**
 * Deterministic triage used when no provider answered. Errs toward asking one
 * more question rather than confidently sending someone to a tutor they may
 * not need — the expensive, hard-to-undo direction.
 */
export function heuristicTriage(fields: BriefFields): {
  outcome: TriageOutcome;
  rationale: string;
} {
  const urgent =
    fields.deadlineAt !== undefined &&
    fields.deadlineAt.getTime() - Date.now() < 21 * 24 * 60 * 60 * 1000;
  const structural =
    (fields.prerequisiteGaps?.length ?? 0) > 0 ||
    (fields.difficulties?.length ?? 0) >= 2;

  if (!fields.educationalLevel || !fields.topic) {
    return {
      outcome: "NEEDS_DIAGNOSTIC",
      rationale:
        "We don't yet know enough about the topic and level to judge whether a tutor is needed.",
    };
  }
  if (urgent || structural) {
    return {
      outcome: "TUTOR_RECOMMENDED",
      rationale: urgent
        ? "There is a deadline close enough that guided practice will help more than self-study."
        : "The difficulty spans more than one topic, which usually needs someone to work through it with you.",
    };
  }
  return {
    outcome: "SELF_STUDY",
    rationale:
      "This looks like a single focused topic — an explanation and some practice may be enough.",
  };
}

// ─── Orchestration ────────────────────────────────────────────────────────

/**
 * Run one analysis pass over the conversation. Attachments are passed through
 * to the vision model so a photographed exercise is genuinely read, not just
 * acknowledged.
 */
export async function analyseIntake(opts: {
  turns: readonly IntakeTurnView[];
  known: BriefFields;
  attachments?: Array<{ url: string; mime: string }>;
  localeHint?: string;
}): Promise<IntakeAnalysis> {
  const { turns, known, attachments = [], localeHint } = opts;
  const prompt = buildExtractionPrompt(turns, known, localeHint);

  const content = await buildVisionContent(prompt, attachments);
  const openai = await generateWithOpenAI(content, EXTRACTION_SYSTEM_PROMPT);

  let raw: string | null = null;
  let source: IntakeAnalysis["source"] = "openai";
  let model = "";

  if ("output" in openai) {
    raw = openai.output;
    model = openai.model;
  } else {
    const anthropic = await generateWithAnthropic(
      prompt,
      EXTRACTION_SYSTEM_PROMPT,
    );
    if ("output" in anthropic) {
      raw = anthropic.output;
      source = "anthropic";
      model = anthropic.model;
    } else {
      console.warn(
        "[edumatch][intake] both providers unavailable, using heuristic extraction:",
        openai.error,
        "|",
        anthropic.error,
      );
    }
  }

  if (raw === null) return heuristicAnalysis(turns, known);

  const parsed = extractJsonObject(raw);
  if (!parsed || typeof parsed !== "object") {
    console.warn("[edumatch][intake] provider returned unparseable JSON");
    return heuristicAnalysis(turns, known);
  }

  const envelope = parsed as Record<string, unknown>;
  const fields = mergeBriefFields(known, parseBriefFields(envelope.fields));

  return {
    fields,
    help: parseHelp(envelope.help),
    triage: parseTriage(envelope.triage) ?? heuristicTriage(fields),
    source,
    model,
  };
}

function heuristicAnalysis(
  turns: readonly IntakeTurnView[],
  known: BriefFields,
): IntakeAnalysis {
  const studentText = turns
    .filter((t) => t.role === "STUDENT")
    .map((t) => t.content)
    .join("\n");
  const fields = mergeBriefFields(known, heuristicExtract(studentText));
  return {
    fields,
    // No provider means no explanation we'd be willing to put a student's name
    // on. The UI shows the study plan and questions instead of fabricating a
    // lesson, and the brief still gets built.
    help: null,
    triage: heuristicTriage(fields),
    source: "heuristic",
    model: "heuristic",
  };
}
