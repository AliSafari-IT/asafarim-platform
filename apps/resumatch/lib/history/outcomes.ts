import { jobKey } from "../journey";
import type { ApplicationStatusName } from "../applications/constants";
import { OUTCOME_STAGES, type OutcomeStage } from "./stages";
import { utcToZonedLocal } from "../applications/zonedTime";

/**
 * Ties the tailoring history to the application tracker, so /tailor/history
 * can say what happened to each job a CV was tailored for: not tracked
 * yet, saved, applied, interviewing, offer or rejected.
 *
 * Read-only and pure: the page passes the rows it already loaded. The link
 * comes from data that already exists — `Application.tailoredResumeId`
 * (the version the candidate saved or sent) and, failing that, the job.
 * The same posting fetched twice is two TargetJob rows, so "the job" means
 * the same `jobKey` (title + employer), as everywhere else on the page.
 */

interface JobRef {
  id: string;
  title: string | null;
  employer: string | null;
}

export interface OutcomeResume {
  id: string;
  createdAt: Date | string;
  targetJobId: string;
  targetJob: JobRef;
}

export interface OutcomeApplication {
  id: string;
  status: ApplicationStatusName;
  targetJobId: string;
  tailoredResumeId: string | null;
  appliedAt: Date | string | null;
  /** The zone the candidate named for `appliedAt`; null shows the UTC day. */
  appliedTimeZone?: string | null;
  /** A logged answer on the timeline (recruiter reply, interview, offer or
   *  rejection) even if the status was left on Applied. See REPLY_EVENT_KINDS. */
  replied?: boolean;
  updatedAt: Date | string;
  targetJob: JobRef;
}

/** Timeline entries that mean the employer answered. A confirmation receipt
 *  or the candidate's own follow-up does not. */
export const REPLY_EVENT_KINDS = ["RECRUITER_REPLY", "INTERVIEW", "OFFER", "REJECTION"] as const;


export { OUTCOME_STAGES, type OutcomeStage };

/** A status that means the application went out. */
const SENT: ReadonlySet<ApplicationStatusName> = new Set(["APPLIED", "INTERVIEWING", "OFFER", "REJECTED"]);
/** The employer answered: anything past "Applied". */
const ANSWERED: ReadonlySet<ApplicationStatusName> = new Set(["INTERVIEWING", "OFFER", "REJECTED"]);

/** How long an application may wait before the page calls it "no answer yet". */
export const QUIET_AFTER_DAYS = 14;

export interface VersionOutcome {
  applicationId: string;
  status: ApplicationStatusName;
  appliedAt: Date | null;
  /** "version": this exact CV is the one saved on the application. "job":
   *  the job is tracked, with another version or none. */
  via: "version" | "job";
}

export interface JobOutcome {
  key: string;
  title: string | null;
  employer: string | null;
  stage: OutcomeStage;
  versions: number;
  /** Newest version for the job: where "Track" sends the candidate. */
  latestResumeId: string;
  applicationId: string | null;
  appliedAt: Date | null;
  /** `appliedAt` as a calendar day in the zone the candidate recorded it in. */
  appliedDay: string | null;
  /** The employer answered: a status past Applied, or a logged reply. */
  answered: boolean;
  /** Applied more than QUIET_AFTER_DAYS ago, still on "Applied", no logged reply. */
  quiet: boolean;
}

export interface OutcomeSummary {
  jobs: JobOutcome[];
  byStage: Record<OutcomeStage, number>;
  /** Tailored jobs the candidate actually applied to (any sent status). */
  applied: number;
  /** Of those, how many got an answer (interview, offer or rejection). */
  answered: number;
  /** Of those, interviews or offers. */
  interviews: number;
  /** Applied jobs still waiting longer than QUIET_AFTER_DAYS. */
  quiet: number;
  /** Tracked applications for jobs with no tailored CV in history. */
  otherApplications: number;
  versionOutcomes: Map<string, VersionOutcome>;
}

const time = (value: Date | string) => new Date(value).getTime();
const asDate = (value: Date | string | null) => (value ? new Date(value) : null);

/** When several applications point at the same thing, a sent one beats an
 *  unsent "Saved" one (saving another CV for a job already applied to must
 *  not hide that application); otherwise the one touched last wins. */
function newer(a: OutcomeApplication | undefined, b: OutcomeApplication): OutcomeApplication {
  if (!a) return b;
  const sentA = SENT.has(a.status);
  if (sentA !== SENT.has(b.status)) return sentA ? a : b;
  const diff = time(b.updatedAt) - time(a.updatedAt);
  if (diff !== 0) return diff > 0 ? b : a;
  return b.id > a.id ? b : a;
}

export function summarizeOutcomes(
  resumes: OutcomeResume[],
  applications: OutcomeApplication[],
  now: Date = new Date(),
): OutcomeSummary {
  const byResume = new Map<string, OutcomeApplication>();
  const byJobId = new Map<string, OutcomeApplication>();
  const byKey = new Map<string, OutcomeApplication>();
  for (const app of applications) {
    if (app.tailoredResumeId) byResume.set(app.tailoredResumeId, newer(byResume.get(app.tailoredResumeId), app));
    byJobId.set(app.targetJobId, newer(byJobId.get(app.targetJobId), app));
    const key = jobKey(app.targetJob);
    byKey.set(key, newer(byKey.get(key), app));
  }

  const versionOutcomes = new Map<string, VersionOutcome>();
  for (const resume of resumes) {
    const exact = byResume.get(resume.id);
    // Without an exact match, the same winner as the job summary, so the
    // version and its job never point at different applications.
    const job = exact ?? byKey.get(jobKey(resume.targetJob)) ?? byJobId.get(resume.targetJobId);
    if (!job) continue;
    versionOutcomes.set(resume.id, {
      applicationId: job.id,
      status: job.status,
      appliedAt: asDate(job.appliedAt),
      via: exact ? "version" : "job",
    });
  }

  // One entry per distinct job, in the order of its newest version.
  const sorted = [...resumes].sort((a, b) => time(b.createdAt) - time(a.createdAt));
  const jobsByKey = new Map<string, JobOutcome>();
  const quietBefore = now.getTime() - QUIET_AFTER_DAYS * 24 * 60 * 60 * 1000;
  for (const resume of sorted) {
    const key = jobKey(resume.targetJob);
    const existing = jobsByKey.get(key);
    if (existing) {
      existing.versions += 1;
      continue;
    }
    const app = byKey.get(key) ?? byJobId.get(resume.targetJobId);
    const appliedAt = app ? asDate(app.appliedAt) : null;
    const answered = Boolean(app && (ANSWERED.has(app.status) || (SENT.has(app.status) && app.replied)));
    jobsByKey.set(key, {
      key,
      title: resume.targetJob.title,
      employer: resume.targetJob.employer,
      stage: app ? app.status : "UNTRACKED",
      versions: 1,
      latestResumeId: resume.id,
      applicationId: app?.id ?? null,
      appliedAt,
      appliedDay: appliedAt ? utcToZonedLocal(appliedAt, app?.appliedTimeZone ?? "UTC").slice(0, 10) : null,
      answered,
      quiet: app?.status === "APPLIED" && !answered && appliedAt !== null && appliedAt.getTime() < quietBefore,
    });
  }

  const jobs = [...jobsByKey.values()];
  const byStage = Object.fromEntries(OUTCOME_STAGES.map((s) => [s, 0])) as Record<OutcomeStage, number>;
  for (const job of jobs) byStage[job.stage] += 1;

  const sentStatus = (s: OutcomeStage) => s !== "UNTRACKED" && SENT.has(s);

  const otherKeys = new Set<string>();
  for (const app of applications) {
    const key = jobKey(app.targetJob);
    if (!jobsByKey.has(key)) otherKeys.add(key);
  }

  return {
    jobs,
    byStage,
    applied: jobs.filter((j) => sentStatus(j.stage)).length,
    answered: jobs.filter((j) => j.answered).length,
    interviews: jobs.filter((j) => j.stage === "INTERVIEWING" || j.stage === "OFFER").length,
    quiet: jobs.filter((j) => j.quiet).length,
    otherApplications: otherKeys.size,
    versionOutcomes,
  };
}

/** Whole-number percentage, or null when there is nothing to divide by. */
export function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}
