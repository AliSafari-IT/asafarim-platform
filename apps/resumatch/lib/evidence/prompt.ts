import type { CandidateProfileContent } from "../profile/contract";
import {
  describeExperienceRef,
  findExperience,
  PROFESSIONAL_EVIDENCE_KINDS,
  readExperienceRef,
  type EvidenceKind,
  type EvidenceScope,
  type ExperienceRef,
} from "./contract";

/**
 * Which evidence reaches a prompt, and how it reads there (#929). Pure, so
 * the selection rules are testable without a database.
 */

/** One item as the store loads it: the item and its latest revision. */
export interface StoredEvidence {
  id: string;
  workspaceId: string;
  scope: EvidenceScope;
  targetJobId: string | null;
  createdAt: Date;
  latest: {
    id: string;
    kind: EvidenceKind;
    title: string;
    detail: string;
    experienceRef: unknown;
    status: "DRAFT" | "CONFIRMED";
  } | null;
}

export interface PromptEvidence {
  revisionId: string;
  kind: EvidenceKind;
  title: string;
  detail: string;
  /** The profile role it belongs to, as the prompt names it; null: none. */
  role: string | null;
  /** #930: that role's index in `profile.experience`, or null. */
  roleIndex: number | null;
}

export interface GenerationEvidence {
  professional: PromptEvidence[];
  motivation: PromptEvidence[];
  /** Every revision selected, in prompt order. Motivation is included;
   *  use `usedRevisionIds` for what a run actually sent. */
  revisionIds: string[];
}

/** The revisions a run actually sent: motivation only reaches the letter,
 *  so a CV-only run does not depend on it. */
export function usedRevisionIds(evidence: GenerationEvidence, withLetter: boolean): string[] {
  return (withLetter ? [...evidence.professional, ...evidence.motivation] : evidence.professional).map((item) => item.revisionId);
}

export const NO_EVIDENCE: GenerationEvidence = { professional: [], motivation: [], revisionIds: [] };

/** Prompt budgets. Whole items only: an item that does not fit is left out,
 *  never cut mid-sentence. With #930 the most job-relevant items go first. */
export const MAX_PROFESSIONAL_EVIDENCE_CHARS = 4000;
export const MAX_MOTIVATION_EVIDENCE_CHARS = 1500;

export type EvidenceExclusion = "draft" | "other_workspace" | "other_job" | "experience_missing";

/** Why an item cannot be used for this run, or null when it can. */
export function evidenceExclusion(
  item: StoredEvidence,
  workspaceId: string,
  targetJobId: string,
  profile: CandidateProfileContent,
): EvidenceExclusion | null {
  if (item.workspaceId !== workspaceId) return "other_workspace";
  if (item.scope === "APPLICATION" && item.targetJobId !== targetJobId) return "other_job";
  if (!item.latest || item.latest.status !== "CONFIRMED") return "draft";
  const ref = readExperienceRef(item.latest.experienceRef);
  if (ref && !findExperience(profile, ref)) return "experience_missing";
  return null;
}

/** Strip fence sentinels, so typed text cannot close a fenced block. */
function clean(text: string): string {
  return text.replace(/<<<|>>>/g, "").replace(/\s+/g, " ").trim();
}

/** #930: the stable source id the CV prompt tags an item with. A revision
 *  is immutable, so the id names exactly the text the model saw. */
export function evidenceSourceId(revisionId: string): string {
  return `ev:${revisionId}`;
}

function line(item: PromptEvidence, withSourceId = false): string {
  const label = item.kind.charAt(0) + item.kind.slice(1).toLowerCase();
  const role = item.kind === "MOTIVATION" ? "" : item.role ? ` [role: ${item.role}]` : " [no single role]";
  const tag = withSourceId ? `[${evidenceSourceId(item.revisionId)}] ` : "";
  return `- ${tag}${label}: ${clean(item.title)}. ${clean(item.detail)}${role}`;
}

/**
 * The confirmed evidence for one run, inside the budgets. Drafts, other
 * jobs', other workspaces' and role-less-now items never appear.
 *
 * Order: with `relevance` (#930: how many job-requirement terms an item
 * mentions), the most relevant items first, so a long list keeps what this
 * job asks about. Ties, and every run without `relevance`: this job's items
 * first, then background, each oldest first.
 */
export function selectGenerationEvidence(
  items: StoredEvidence[],
  workspaceId: string,
  targetJobId: string,
  profile: CandidateProfileContent,
  relevance?: (text: string) => number,
): GenerationEvidence {
  const score = new Map<string, number>();
  if (relevance) for (const item of items) if (item.latest) score.set(item.id, relevance(`${item.latest.title} ${item.latest.detail}`));
  const usable = items
    .filter((item) => evidenceExclusion(item, workspaceId, targetJobId, profile) === null)
    .sort(
      (a, b) =>
        (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0) ||
        (a.scope === b.scope ? a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id) : a.scope === "APPLICATION" ? -1 : 1),
    );

  const professional: PromptEvidence[] = [];
  const motivation: PromptEvidence[] = [];
  let professionalChars = 0;
  let motivationChars = 0;
  for (const item of usable) {
    const latest = item.latest!;
    const ref: ExperienceRef | null = readExperienceRef(latest.experienceRef);
    const roleEntry = ref ? findExperience(profile, ref) : null;
    const entry: PromptEvidence = {
      revisionId: latest.id,
      kind: latest.kind,
      title: latest.title,
      detail: latest.detail,
      role: ref ? describeExperienceRef(ref) : null,
      roleIndex: roleEntry ? profile.experience.indexOf(roleEntry) : null,
    };
    const size = line(entry).length + 1;
    if (PROFESSIONAL_EVIDENCE_KINDS.includes(latest.kind)) {
      if (professionalChars + size > MAX_PROFESSIONAL_EVIDENCE_CHARS) continue;
      professionalChars += size;
      professional.push(entry);
    } else {
      if (motivationChars + size > MAX_MOTIVATION_EVIDENCE_CHARS) continue;
      motivationChars += size;
      motivation.push(entry);
    }
  }
  return {
    professional,
    motivation,
    revisionIds: [...professional, ...motivation].map((item) => item.revisionId),
  };
}

/** The professional block as both prompts fence it; null when empty.
 *  `withSourceIds` (#930, CV prompt only) tags each line with its source id
 *  so suggestions can cite it; the letter gets the untagged block. */
export function renderProfessionalEvidence(evidence: GenerationEvidence | null | undefined, withSourceIds = false): string | null {
  return evidence && evidence.professional.length > 0 ? evidence.professional.map((item) => line(item, withSourceIds)).join("\n") : null;
}

/** The motivation block (letter only); null when empty. */
export function renderMotivationEvidence(evidence: GenerationEvidence | null | undefined): string | null {
  return evidence && evidence.motivation.length > 0 ? evidence.motivation.map((item) => line(item)).join("\n") : null;
}
