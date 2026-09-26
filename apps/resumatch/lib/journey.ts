import "server-only";
import { getJobmatchDb } from "./db/client";

/**
 * Where a candidate is in ResuMatch's three-stage flow — profile, tailor,
 * track — read from real rows so the page hero's journey tracker never
 * claims progress that hasn't happened. One small query per stage.
 */
export interface JourneyCounts {
  profileConfirmed: boolean;
  tailoredCount: number;
  applicationsCount: number;
}

export async function getJourneyCounts(workspaceId: string): Promise<JourneyCounts> {
  const db = getJobmatchDb();
  const [profile, tailoredCount, applicationsCount] = await Promise.all([
    db.candidateProfile.findUnique({ where: { workspaceId }, select: { confirmedVersionId: true } }),
    db.tailoredResume.count({ where: { workspaceId } }),
    db.application.count({ where: { workspaceId } }),
  ]);
  return { profileConfirmed: Boolean(profile?.confirmedVersionId), tailoredCount, applicationsCount };
}

/**
 * The same posting fetched twice becomes two TargetJob rows, so counting
 * target-job ids overstates how many distinct jobs a candidate tailored
 * toward. Group by what the candidate sees instead: title + employer
 * (case- and whitespace-insensitive), falling back to the row id when a
 * job has neither.
 */
export function jobKey(job: { id: string; title: string | null; employer: string | null }): string {
  const norm = (s: string | null) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  const key = `${norm(job.title)}|${norm(job.employer)}`;
  return key === "|" ? `id:${job.id}` : key;
}
