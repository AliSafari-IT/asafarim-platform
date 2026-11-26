import { describe, expect, it } from "vitest";
import { percent, summarizeOutcomes, type OutcomeApplication, type OutcomeResume } from "./outcomes";

const job = (id: string, title: string | null, employer: string | null) => ({ id, title, employer });
const resume = (id: string, createdAt: string, j: ReturnType<typeof job>): OutcomeResume => ({
  id,
  createdAt,
  targetJobId: j.id,
  targetJob: j,
});
const app = (over: Partial<OutcomeApplication> & Pick<OutcomeApplication, "id" | "targetJob">): OutcomeApplication => ({
  status: "SAVED",
  tailoredResumeId: null,
  appliedAt: null,
  updatedAt: "2026-11-20T00:00:00Z",
  targetJobId: over.targetJob.id,
  ...over,
});

const now = new Date("2026-11-26T12:00:00Z");
const kingfisher = job("j1", "Software Developer (AI)", "Kingfisher IT");
const kingfisherAgain = job("j1b", "software developer (ai)", "KINGFISHER IT");
const sweco = job("j2", "Solution Architect", "Sweco");
const clovr = job("j3", "Full stack Developer", "CLOVR");

describe("summarizeOutcomes", () => {
  it("marks the exact version saved on the application, and the rest of the job by job", () => {
    const resumes = [
      resume("r3", "2026-11-22T18:00:00Z", kingfisher),
      resume("r2", "2026-11-21T18:00:00Z", kingfisherAgain),
      resume("r1", "2026-11-20T18:00:00Z", kingfisher),
    ];
    const apps = [app({ id: "a1", targetJob: kingfisher, tailoredResumeId: "r2", status: "REJECTED" })];
    const s = summarizeOutcomes(resumes, apps, now);
    expect(s.versionOutcomes.get("r2")).toMatchObject({ applicationId: "a1", status: "REJECTED", via: "version" });
    expect(s.versionOutcomes.get("r3")).toMatchObject({ applicationId: "a1", via: "job" });
    // Same posting fetched twice (another TargetJob row) still counts as the job.
    expect(s.versionOutcomes.get("r1")).toMatchObject({ via: "job" });
    expect(s.jobs).toHaveLength(1);
    expect(s.jobs[0]).toMatchObject({ stage: "REJECTED", versions: 3, latestResumeId: "r3", applicationId: "a1" });
  });

  it("counts stages, answers and interviews per distinct job", () => {
    const resumes = [
      resume("r1", "2026-11-25T00:00:00Z", kingfisher),
      resume("r2", "2026-11-24T00:00:00Z", sweco),
      resume("r3", "2026-11-23T00:00:00Z", clovr),
      resume("r4", "2026-11-22T00:00:00Z", job("j4", "Analyst", "PROFEL")),
    ];
    const apps = [
      app({ id: "a1", targetJob: kingfisher, status: "INTERVIEWING", appliedAt: "2026-11-21T00:00:00Z" }),
      app({ id: "a2", targetJob: sweco, status: "APPLIED", appliedAt: "2026-11-01T00:00:00Z" }),
      app({ id: "a3", targetJob: clovr, status: "SAVED" }),
      app({ id: "a9", targetJob: job("j9", "Elsewhere", "Other Co"), status: "APPLIED" }),
    ];
    const s = summarizeOutcomes(resumes, apps, now);
    expect(s.byStage).toEqual({ OFFER: 0, INTERVIEWING: 1, APPLIED: 1, REJECTED: 0, SAVED: 1, UNTRACKED: 1 });
    expect(s.applied).toBe(2);
    expect(s.answered).toBe(1);
    expect(s.interviews).toBe(1);
    // Sweco applied on Nov 1 and still on "Applied": quiet.
    expect(s.quiet).toBe(1);
    expect(s.jobs.find((j) => j.key.includes("sweco"))?.quiet).toBe(true);
    expect(s.otherApplications).toBe(1);
    expect(s.versionOutcomes.has("r4")).toBe(false);
  });

  it("uses the application touched last when a job has several", () => {
    const resumes = [resume("r1", "2026-11-25T00:00:00Z", kingfisher)];
    const apps = [
      app({ id: "old", targetJob: kingfisher, status: "SAVED", updatedAt: "2026-11-01T00:00:00Z" }),
      app({ id: "new", targetJob: kingfisher, status: "OFFER", updatedAt: "2026-11-25T00:00:00Z" }),
    ];
    const s = summarizeOutcomes(resumes, apps, now);
    expect(s.jobs[0]).toMatchObject({ stage: "OFFER", applicationId: "new" });
    expect(s.versionOutcomes.get("r1")?.applicationId).toBe("new");
  });

  it("a newer unsent Saved row never hides an application already sent", () => {
    const resumes = [resume("r2", "2026-11-25T00:00:00Z", kingfisher), resume("r1", "2026-11-20T00:00:00Z", kingfisher)];
    const apps = [
      app({ id: "sent", targetJob: kingfisher, tailoredResumeId: "r1", status: "INTERVIEWING", appliedAt: "2026-11-21T00:00:00Z", updatedAt: "2026-11-22T00:00:00Z" }),
      app({ id: "draft", targetJob: kingfisher, tailoredResumeId: "r2", status: "SAVED", updatedAt: "2026-11-25T00:00:00Z" }),
    ];
    const s = summarizeOutcomes(resumes, apps, now);
    expect(s.jobs[0]).toMatchObject({ stage: "INTERVIEWING", applicationId: "sent" });
    expect(s.applied).toBe(1);
    expect(s.answered).toBe(1);
    // Each version still points at its own application.
    expect(s.versionOutcomes.get("r2")).toMatchObject({ applicationId: "draft", via: "version" });
  });

  it("a logged reply counts as an answer and stops the follow-up nudge", () => {
    const resumes = [resume("r1", "2026-10-30T00:00:00Z", sweco)];
    const apps = [app({ id: "a1", targetJob: sweco, status: "APPLIED", appliedAt: "2026-11-01T00:00:00Z", replied: true })];
    const s = summarizeOutcomes(resumes, apps, now);
    expect(s.answered).toBe(1);
    expect(s.quiet).toBe(0);
    expect(s.jobs[0]).toMatchObject({ stage: "APPLIED", answered: true, quiet: false });
  });

  it("shows the applied day in the zone it was recorded in", () => {
    const resumes = [resume("r1", "2026-11-20T00:00:00Z", sweco), resume("r2", "2026-11-20T00:00:00Z", clovr)];
    const apps = [
      // 00:30 on Nov 26 in Brussels is still Nov 25 in UTC.
      app({ id: "a1", targetJob: sweco, status: "APPLIED", appliedAt: "2026-11-25T23:30:00Z", appliedTimeZone: "Europe/Brussels" }),
      app({ id: "a2", targetJob: clovr, status: "APPLIED", appliedAt: "2026-11-25T23:30:00Z" }),
    ];
    const s = summarizeOutcomes(resumes, apps, now);
    expect(s.jobs.find((j) => j.key.includes("sweco"))?.appliedDay).toBe("2026-11-26");
    expect(s.jobs.find((j) => j.key.includes("clovr"))?.appliedDay).toBe("2026-11-25");
  });

  it("is empty-safe", () => {
    const s = summarizeOutcomes([], [], now);
    expect(s.jobs).toEqual([]);
    expect(s.applied).toBe(0);
  });
});

describe("percent", () => {
  it("rounds, and returns null for an empty base", () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(0, 0)).toBeNull();
  });
});
