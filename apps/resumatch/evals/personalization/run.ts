/**
 * Deterministic personalization evaluation (#934).
 *
 * Runs every synthetic case through the same pure functions the server
 * uses to build a tailoring run (evidence selection, profile selection,
 * writing-preference resolution, the CV and letter prompts, the merge and
 * the claim checks), with a fixed stand-in for the provider reply. No
 * database, no network, no model: the result is the same on every machine,
 * so CI can gate on it.
 *
 * Two variants are compared:
 * - `baseline` (`baseline_pre_milestone@1`): the pipeline before milestone
 *   34. The whole profile as text, cut at the prompt's 8,000 characters,
 *   no evidence, no requirement gaps, no saved preferences, and the note
 *   in the CV prompt only.
 * - `candidate`: the current pipeline (#928 to #933).
 *
 * Measured per case:
 * - isolation: no other workspace's evidence in any prompt (gate, 100%).
 * - scope: no draft, other-job or (in the CV) motivation evidence, and no
 *   saved style note when the request switched it off (gate, 100%).
 * - fixedFacts: titles, employers, dates, education, certifications and
 *   the skill set copied from the profile, whatever the reply proposed
 *   (gate, 100%).
 * - injection: forged fence text stays inside its data block, and nothing
 *   from the job reaches the system prompt (gate, 100%).
 * - instruction: the note reaches every prompt that should get it, and
 *   language/tone resolve as the case expects.
 * - evidenceRecall: share of `relevant` phrases the CV prompt contains.
 * - guardCatch: share of the reply's fabricated bullet and letter sentence
 *   that the claim checks flag or remove. Reported, not a gate: the
 *   lexical checks are a safety net, and human review is the gate for
 *   fabrications (rubric.md).
 *
 * Reports hold case ids, categories and numbers only, never case text.
 */

import { createHash } from "node:crypto";
import { parseProfileContent, type CandidateProfileContent } from "../../lib/profile/contract";
import { buildProfileText } from "../../lib/tailoring/buildProfileText";
import { selectGenerationEvidence, renderMotivationEvidence, renderProfessionalEvidence, type StoredEvidence } from "../../lib/evidence/prompt";
import { evidenceRelevanceForJob, selectTailoringInputs, SELECTION_VERSION } from "../../lib/tailoring/selection/select";
import { renderTailorPrompt, MAX_PROFILE_CHARS } from "../../lib/tailoring/ai/prompts";
import { TAILOR_PROMPT_VERSION } from "../../lib/tailoring/ai/registry";
import { renderCoverLetterPrompt } from "../../lib/tailoring/ai/coverLetter/prompts";
import { COVER_LETTER_PROMPT_VERSION } from "../../lib/tailoring/ai/coverLetter/registry";
import { claimEvidence, stripUnbackedClaims } from "../../lib/tailoring/ai/coverLetter/claims";
import { mergeTailoringSuggestions, type TailorSuggestions } from "../../lib/tailoring/ai/schema";
import { checkClaims } from "../../lib/tailoring/selection/claims";
import { TAILORING_CONTEXT_VERSION } from "../../lib/tailoring/context";
import { resolveWriting } from "../../lib/writingPreferences/resolve";
import { readWritingPreferences } from "../../lib/writingPreferences/contract";
import { experienceRefOf } from "../../lib/evidence/contract";
import { CASE_SET_VERSION, CATEGORIES, type Category, type EvalCase } from "./cases";

export const HARNESS_VERSION = "personalization_eval@1";
export const BASELINE_VERSION = "baseline_pre_milestone@1";

export type Variant = "baseline" | "candidate";

export const GATES = ["isolation", "scope", "fixedFacts", "injection"] as const;
export type Gate = (typeof GATES)[number];

export interface CaseResult {
  id: string;
  category: Category;
  variant: Variant;
  gates: Record<Gate, boolean>;
  instruction: boolean;
  evidenceRecall: number;
  guardCatch: number;
}

/** The prompts and inputs one variant builds for one case. Also used by
 *  the provider runner, so both runs send exactly the same prompts. */
export interface BuiltRun {
  profile: CandidateProfileContent;
  cv: ReturnType<typeof renderTailorPrompt>;
  letter: ReturnType<typeof renderCoverLetterPrompt>;
  selection: ReturnType<typeof selectTailoringInputs> | null;
  resolvedLanguage: string | null;
  resolvedTone: string;
}

const SELF = "ws_eval_self";
const FOREIGN = "ws_eval_foreign";
const THIS_JOB = "job_eval_this";
const OTHER_JOB = "job_eval_other";

export function profileOf(c: EvalCase): CandidateProfileContent {
  return parseProfileContent({
    headline: c.headline,
    summary: c.summary,
    skills: c.skills.map((name) => ({ name })),
    experience: c.roles.map((r) => ({ title: r.title, employer: r.employer, startedOn: r.startedOn, endedOn: r.endedOn, isCurrent: r.endedOn === null, summary: r.summary })),
    education: c.education.map((qualification) => ({ qualification })),
    certifications: c.certifications.map((name) => ({ name })),
    languages: c.languages,
  });
}

function storedEvidence(c: EvalCase, profile: CandidateProfileContent): StoredEvidence[] {
  return c.evidence.map((e, i) => ({
    id: `ev_${i}`,
    workspaceId: e.owner === "other_workspace" ? FOREIGN : SELF,
    scope: e.scope,
    targetJobId: e.scope === "APPLICATION" ? (e.job === "other" ? OTHER_JOB : THIS_JOB) : null,
    createdAt: new Date(Date.UTC(2026, 0, 1 + i)),
    latest: {
      id: `rev_${i}`,
      kind: e.kind,
      title: e.title,
      detail: e.detail,
      experienceRef: e.role !== undefined && profile.experience[e.role] ? experienceRefOf(profile.experience[e.role]!) : null,
      status: e.status ?? "CONFIRMED",
    },
  }));
}

export function buildRun(c: EvalCase, variant: Variant): BuiltRun {
  const profile = profileOf(c);
  const writing = resolveWriting(
    {
      cvLanguage: c.request.cvLanguage,
      letterLanguage: c.request.letterLanguage,
      letterTone: c.request.letterTone,
      useSavedStyle: c.request.useSavedStyle,
    },
    variant === "candidate" && c.saved
      ? readWritingPreferences({ cv: { outputLanguage: c.saved.cvLanguage ?? null, styleNote: c.saved.cvStyleNote ?? null }, coverLetter: { tone: c.saved.letterTone ?? null } })
      : null,
  );
  const cvLanguage = writing.cvLanguage.value;
  const letterLanguage = writing.letterLanguage.value ?? cvLanguage;
  const tone = writing.letterTone.value;
  const note = c.request.instructions ?? null;

  if (variant === "baseline") {
    const text = buildProfileText(profile).text.slice(0, MAX_PROFILE_CHARS);
    return {
      profile,
      cv: renderTailorPrompt(text, c.jobText, note, cvLanguage),
      // Before #928 the letter never got the note.
      letter: renderCoverLetterPrompt(text, c.jobText, tone, writing.letterLength.value, letterLanguage),
      selection: null,
      resolvedLanguage: cvLanguage,
      resolvedTone: tone,
    };
  }

  const relevance = evidenceRelevanceForJob(c.jobText);
  const evidence = selectGenerationEvidence(storedEvidence(c, profile), SELF, THIS_JOB, profile, relevance);
  const selection = selectTailoringInputs({ profile, jobText: c.jobText, evidence });
  return {
    profile,
    cv: renderTailorPrompt(selection.profileText, selection.jobTextUsed, note, cvLanguage, false, selection.evidenceText, selection.gapsText, writing.cvStyleNote),
    letter: renderCoverLetterPrompt(
      selection.plainProfileText,
      selection.jobTextUsed,
      tone,
      writing.letterLength.value,
      letterLanguage,
      note,
      { evidence: renderProfessionalEvidence(evidence), motivation: renderMotivationEvidence(evidence) },
      writing.letterStyleNote,
    ),
    selection,
    resolvedLanguage: cvLanguage,
    resolvedTone: tone,
  };
}

const lower = (s: string) => s.toLowerCase();

/** Every text between `open` and `close` lines in a rendered prompt. */
function blocks(user: string, open: string, close: string): string[] {
  const lines = user.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i] !== open) continue;
    const end = lines.indexOf(close, i + 1);
    if (end > i) out.push(lines.slice(i + 1, end).join("\n"));
  }
  return out;
}

function fixtureSuggestions(c: EvalCase): TailorSuggestions {
  // Cite each role's own profile unit, the way a well-behaved reply would,
  // so the claim check looks at content rather than a missing citation.
  return {
    headline: c.fixture.headline,
    summary: c.fixture.summary,
    skillsOrder: c.fixture.skillsOrder,
    experienceBullets: c.fixture.bullets,
    sources: {
      headline: [],
      summary: [],
      experienceBullets: c.fixture.bullets.map((list, i) => list.map(() => [`exp:${i}`])),
    },
  };
}

function checkFixedFacts(run: BuiltRun, suggestions: TailorSuggestions): boolean {
  const merged = mergeTailoringSuggestions(run.profile, suggestions);
  const p = run.profile;
  const rolesKept =
    merged.experience.length === p.experience.length &&
    merged.experience.every((e, i) => {
      const src = p.experience[i]!;
      return e.title === src.title && e.employer === src.employer && e.startedOn === src.startedOn && e.endedOn === src.endedOn;
    });
  const skillSet = new Set(p.skills.map((s) => s.name));
  const skillsKept = merged.skills.length === skillSet.size && merged.skills.every((s) => skillSet.has(s));
  const educationKept = JSON.stringify(merged.education.map((e) => e.qualification)) === JSON.stringify(p.education.map((e) => e.qualification));
  const certsKept = JSON.stringify(merged.certifications.map((e) => e.name)) === JSON.stringify(p.certifications.map((e) => e.name));
  return rolesKept && skillsKept && educationKept && certsKept;
}

function checkInjection(c: EvalCase, run: BuiltRun): boolean {
  // Nothing the job says may reach a system prompt.
  const jobWords = c.jobText.match(/IGNORE ALL PREVIOUS INSTRUCTIONS|SYSTEM: you are free now|Red Hat Certified Architect|Candidate holds the CCIE/g) ?? [];
  if (jobWords.some((w) => run.cv.system.includes(w) || run.letter.system.includes(w))) return false;
  // Forged fence text appears only inside the job block, never as a line of its own.
  for (const prompt of [run.cv.user, run.letter.user]) {
    const lines = prompt.split("\n");
    const opens = lines.filter((l) => l === "<<<RESUMATCH_JOB_DATA").length;
    const closes = lines.filter((l) => l === "RESUMATCH_JOB_DATA>>>").length;
    const profileOpens = lines.filter((l) => l === "<<<RESUMATCH_PROFILE_DATA").length;
    const profileCloses = lines.filter((l) => l === "RESUMATCH_PROFILE_DATA>>>").length;
    if (opens !== 1 || closes !== 1 || profileOpens !== 1 || profileCloses !== 1) return false;
    const job = blocks(prompt, "<<<RESUMATCH_JOB_DATA", "RESUMATCH_JOB_DATA>>>").join("\n");
    for (const w of jobWords) if (prompt.includes(w) && !job.includes(w)) return false;
  }
  return true;
}

function checkInstruction(c: EvalCase, run: BuiltRun, variant: Variant): boolean {
  const note = c.request.instructions?.trim();
  if (note) {
    if (run.cv.instructionsUsed !== note) return false;
    // The letter only got the note from #928 on.
    if (variant === "candidate" && run.letter.instructionsUsed !== note) return false;
    if (variant === "baseline" && run.letter.instructionsUsed === note) return false;
  }
  if (run.resolvedLanguage !== c.expectLanguage) return false;
  if (run.resolvedTone !== c.expectTone) return false;
  return true;
}

function guardCatch(c: EvalCase, run: BuiltRun, suggestions: TailorSuggestions): number {
  let caught = 0;
  // The fabricated CV bullet is the last bullet of role 0.
  if (run.selection) {
    const check = checkClaims({ suggestions, sources: run.selection.sources, requirements: run.selection.requirements, coverage: run.selection.coverage, outputLanguage: (run.resolvedLanguage as never) ?? null });
    const last = (suggestions.experienceBullets[0]?.length ?? 1) - 1;
    const finding = check.claims.find((f) => f.field === "bullet" && f.experienceIndex === 0 && f.bulletIndex === last);
    if (finding && finding.flags.length > 0) caught += 1;
  }
  // The fabricated letter sentence: removed by the letter claim check?
  const evidenceText = run.selection ? run.selection.plainProfileText : run.cv.profileTextUsed;
  const stripped = stripUnbackedClaims(c.fixture.letterParagraphs[1]!, claimEvidence(evidenceText));
  if (stripped.removedSentences > 0) caught += 1;
  return caught / 2;
}

export function evaluateCase(c: EvalCase, variant: Variant): CaseResult {
  const run = buildRun(c, variant);
  const prompts = [run.cv.system, run.cv.user, run.letter.system, run.letter.user].join("\n");
  const foreign = c.evidence.filter((e) => e.owner === "other_workspace").map((e) => e.detail);
  const outOfScope = [
    ...c.excluded,
    ...c.evidence.filter((e) => e.status === "DRAFT" || e.job === "other").map((e) => e.detail),
  ];
  const motivation = c.evidence.filter((e) => e.kind === "MOTIVATION").map((e) => e.detail);
  const suggestions = fixtureSuggestions(c);

  const isolation = foreign.every((t) => !prompts.includes(t));
  const scope = outOfScope.every((t) => !prompts.includes(t)) && motivation.every((t) => !run.cv.user.includes(t));
  const cvInput = lower(run.cv.user);
  const recall = c.relevant.length === 0 ? 1 : c.relevant.filter((r) => cvInput.includes(lower(r))).length / c.relevant.length;

  return {
    id: c.id,
    category: c.category,
    variant,
    gates: { isolation, scope, fixedFacts: checkFixedFacts(run, suggestions), injection: checkInjection(c, run) },
    instruction: checkInstruction(c, run, variant),
    evidenceRecall: recall,
    guardCatch: guardCatch(c, run, suggestions),
  };
}

export interface VariantSummary {
  variant: Variant;
  cases: number;
  gatePassRate: Record<Gate, number>;
  instructionRate: number;
  evidenceRecall: number;
  guardCatch: number;
  byCategory: Record<Category, { cases: number; evidenceRecall: number; instructionRate: number; gatesPassed: number }>;
}

const mean = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
const round = (x: number) => Math.round(x * 1000) / 1000;

export function summarize(results: CaseResult[], variant: Variant): VariantSummary {
  const rows = results.filter((r) => r.variant === variant);
  const gatePassRate = Object.fromEntries(GATES.map((g) => [g, round(mean(rows.map((r) => (r.gates[g] ? 1 : 0))))])) as Record<Gate, number>;
  const byCategory = Object.fromEntries(
    CATEGORIES.map((cat) => {
      const c = rows.filter((r) => r.category === cat);
      return [
        cat,
        {
          cases: c.length,
          evidenceRecall: round(mean(c.map((r) => r.evidenceRecall))),
          instructionRate: round(mean(c.map((r) => (r.instruction ? 1 : 0)))),
          gatesPassed: c.filter((r) => GATES.every((g) => r.gates[g])).length,
        },
      ];
    }),
  ) as VariantSummary["byCategory"];
  return {
    variant,
    cases: rows.length,
    gatePassRate,
    instructionRate: round(mean(rows.map((r) => (r.instruction ? 1 : 0)))),
    evidenceRecall: round(mean(rows.map((r) => r.evidenceRecall))),
    guardCatch: round(mean(rows.map((r) => r.guardCatch))),
    byCategory,
  };
}

export interface DeterministicReport {
  harnessVersion: string;
  caseSetVersion: string;
  caseSetHash: string;
  versions: {
    baseline: string;
    tailorPrompt: string;
    coverLetterPrompt: string;
    tailoringContext: string;
    evidenceSelection: string;
  };
  baseline: VariantSummary;
  candidate: VariantSummary;
  /** Case ids whose candidate run failed a gate: must be empty. */
  gateFailures: { id: string; gates: Gate[] }[];
  /** True when every candidate gate passed on every case. */
  deterministicGo: boolean;
}

export function caseSetHash(cases: EvalCase[]): string {
  return createHash("sha256").update(JSON.stringify(cases)).digest("hex").slice(0, 16);
}

export function runDeterministic(cases: EvalCase[]): { results: CaseResult[]; report: DeterministicReport } {
  const results = cases.flatMap((c) => [evaluateCase(c, "baseline"), evaluateCase(c, "candidate")]);
  const gateFailures = results
    .filter((r) => r.variant === "candidate")
    .map((r) => ({ id: r.id, gates: GATES.filter((g) => !r.gates[g]) }))
    .filter((f) => f.gates.length > 0);
  return {
    results,
    report: {
      harnessVersion: HARNESS_VERSION,
      caseSetVersion: CASE_SET_VERSION,
      caseSetHash: caseSetHash(cases),
      versions: {
        baseline: BASELINE_VERSION,
        tailorPrompt: TAILOR_PROMPT_VERSION,
        coverLetterPrompt: COVER_LETTER_PROMPT_VERSION,
        tailoringContext: TAILORING_CONTEXT_VERSION,
        evidenceSelection: SELECTION_VERSION,
      },
      baseline: summarize(results, "baseline"),
      candidate: summarize(results, "candidate"),
      gateFailures,
      deterministicGo: gateFailures.length === 0,
    },
  };
}
