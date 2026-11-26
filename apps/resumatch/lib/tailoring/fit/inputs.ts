import { createHash } from "node:crypto";
import type { CandidateProfileContent } from "../../profile/contract";
import type { GenerationEvidence } from "../../evidence/prompt";
import { withoutFileHeaders } from "../jobFiles";
import { selectTailoringInputs, type TailoringSelection } from "../selection/select";
import { FIT_CONTRACT_VERSION, type FitSource } from "./contract";

/**
 * What one fit analysis reads (#971), built only from records the server
 * loaded for this workspace. The same function feeds the AI prompt, the
 * keyword check, the citation check and the cache key, so a citation is
 * always checked against exactly the text the analysis could see.
 *
 * Only career information goes in: the profile units #930 selection builds
 * (no name, email, phone or links), confirmed evidence for this job or the
 * background, and the candidate's own work preferences for the suitability
 * questions (where and how they want to work). Never a protected trait:
 * the profile contract has no field for one.
 */

/** The job text one analysis reads. Longer postings keep their opening and
 *  every line that reads like a requirement; the cut is reported. */
export const MAX_FIT_JOB_CHARS = 12_000;
/** The candidate's selected profile prose, as #930 selection trims it. */
export const MAX_FIT_PROFILE_CHARS = 9_000;

export interface FitInputs {
  jobText: string;
  /** The job text the analysis used (possibly shortened). */
  jobTextUsed: string;
  jobTruncated: boolean;
  /** sha256 of the full job text. */
  jobFingerprint: string;
  sources: FitSource[];
  /** The tagged source block a prompt gets: one `[id] text` line each. */
  sourcesText: string;
  profileSentencesOmitted: number;
  /** Every confirmed evidence revision the analysis read. */
  evidenceRevisionIds: string[];
  selection: TailoringSelection;
  profileTooThin: boolean;
}

const REMOTE_LABEL: Record<string, string> = {
  onsite: "on-site",
  hybrid: "hybrid",
  remote: "remote",
  any: "any (on-site, hybrid or remote)",
};

/** The candidate's own work preferences, as sources the suitability checks
 *  may cite. Empty preferences give no source: unknown stays unknown. */
export function preferenceSources(profile: CandidateProfileContent): FitSource[] {
  const sources: FitSource[] = [];
  const prefs = profile.preferences;
  const where = [
    profile.baseLocation ? `Based in ${profile.baseLocation}.` : null,
    prefs.locations.length > 0 ? `Willing to work in: ${prefs.locations.join(", ")}.` : null,
  ].filter(Boolean);
  if (where.length > 0) sources.push({ id: "pref:location", kind: "preference", text: where.join(" "), label: "location" });
  if (prefs.remote) {
    sources.push({ id: "pref:remote", kind: "preference", text: `Preferred work arrangement: ${REMOTE_LABEL[prefs.remote] ?? prefs.remote}.`, label: "remote" });
  }
  if (prefs.contractTypes.length > 0) {
    sources.push({ id: "pref:contract", kind: "preference", text: `Contract types wanted: ${prefs.contractTypes.join(", ").replace(/_/g, " ")}.`, label: "contract" });
  }
  return sources;
}

/** Strip fence sentinels; brackets become parentheses so a line can never
 *  pose as another source's tag. */
function clean(text: string): string {
  return text.replace(/<<<|>>>/g, "").replace(/\[/g, "(").replace(/\]/g, ")").replace(/\s+/g, " ").trim();
}

function jobTextFor(jobText: string, selection: TailoringSelection): { used: string; truncated: boolean } {
  if (jobText.length <= MAX_FIT_JOB_CHARS) return { used: jobText, truncated: false };
  // #930's own job selection, at this budget: the opening plus every
  // requirement line the opening does not hold.
  const head = jobText.slice(0, Math.floor(MAX_FIT_JOB_CHARS * 0.7));
  const missing = selection.requirements.filter((r) => !head.includes(r.text.replace(/…$/, ""))).map((r) => `- ${r.text}`);
  const tail = missing.length > 0 ? `\n[… requirement lines from later in the posting:]\n${missing.join("\n")}` : "";
  return { used: `${head}${tail}`.slice(0, MAX_FIT_JOB_CHARS), truncated: true };
}

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

/** Masks the candidate's name (whole and its parts of three or more
 *  letters), email, phone, any email address and their profile links. */
export function contactRedactor(profile: CandidateProfileContent): (text: string) => string {
  const names = new Set<string>();
  if (profile.fullName) {
    names.add(profile.fullName);
    for (const part of profile.fullName.split(/\s+/)) if (part.length >= 3) names.add(part);
  }
  const literals = [profile.phone, ...profile.links.map((l) => l.url)].filter((v): v is string => Boolean(v && v.trim()));
  const nameRe = names.size
    ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${[...names].sort((a, b) => b.length - a.length).map(escapeRe).join("|")})(?![\\p{L}\\p{N}])`, "giu")
    : null;
  return (text: string) => {
    let out = text.replace(EMAIL, "[email]");
    for (const literal of literals) out = out.split(literal).join("[contact]");
    return nameRe ? out.replace(nameRe, "[the candidate]") : out;
  };
}

export function buildFitInputs(input: {
  profile: CandidateProfileContent;
  rawJobText: string;
  evidence: GenerationEvidence;
}): FitInputs {
  const jobText = withoutFileHeaders(input.rawJobText);
  const selection = selectTailoringInputs({
    profile: input.profile,
    jobText,
    evidence: input.evidence,
    profileBudget: MAX_FIT_PROFILE_CHARS,
  });
  const { used, truncated } = jobTextFor(jobText, selection);
  // Evidence and summaries are free text: the candidate's own name and
  // contact details are masked there too, in what the model reads and in
  // what citations are checked against.
  const redact = contactRedactor(input.profile);
  const sources: FitSource[] = [
    ...selection.sources.map((s) => ({ id: s.id, kind: s.kind, text: redact(s.text), label: s.label })),
    ...preferenceSources(input.profile),
  ];
  const prefLines = preferenceSources(input.profile).map((s) => `[${s.id}] ${clean(s.text)}`);
  const sourcesText = [
    redact(selection.profileText),
    selection.evidenceText ? `Confirmed evidence:\n${redact(selection.evidenceText)}` : null,
    prefLines.length > 0 ? `Work preferences:\n${prefLines.join("\n")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const profile = input.profile;
  return {
    jobText,
    jobTextUsed: used,
    jobTruncated: truncated,
    jobFingerprint: createHash("sha256").update(input.rawJobText).digest("hex"),
    sources,
    sourcesText,
    profileSentencesOmitted: selection.omittedSentences,
    evidenceRevisionIds: input.evidence.professional.map((e) => e.revisionId),
    selection,
    profileTooThin: profile.experience.length === 0 && profile.skills.length < 3 && input.evidence.professional.length === 0,
  };
}

export interface FitFingerprintInput {
  workspaceId: string;
  targetJobId: string;
  profileVersionId: string;
  jobFingerprint: string;
  /** Evidence revisions that are not a clarification answer of this job:
   *  answers apply as an overlay, so confirming one never forces a new
   *  (paid) analysis. */
  evidenceRevisionIds: string[];
  method: "ai" | "keyword";
  provider: string;
  model: string;
  promptVersion: string;
}

/** Every assessment-affecting input, workspace included: two workspaces
 *  can never share a cached result. */
export function fitInputFingerprint(input: FitFingerprintInput): string {
  const parts = [
    FIT_CONTRACT_VERSION,
    input.workspaceId,
    input.targetJobId,
    input.profileVersionId,
    input.jobFingerprint,
    [...input.evidenceRevisionIds].sort().join(","),
    input.method,
    input.provider,
    input.model,
    input.promptVersion,
  ];
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}
