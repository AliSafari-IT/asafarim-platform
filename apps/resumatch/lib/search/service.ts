import "server-only";
import { getJobmatchDb } from "../db/client";
import { type EligibilityResult, evaluateEligibility } from "../eligibility/evaluate";
import { AGEING_AFTER_DAYS, freshnessLabel } from "../ingestion/freshness";
import { getConfirmedVersion } from "../profile/versions";
import { foldEmployerName } from "../shared/vocabulary";
import type { SearchQuery } from "./query";

/**
 * Search, assembled (JM-035).
 *
 * Base filtering (text, location, remote, contract, salary, skills) happens
 * in the database query, because it applies to every candidate identically
 * and there is no reason to fetch rows only to discard them in memory.
 * Eligibility is different: it depends on *this* candidate's confirmed
 * profile, so it is evaluated per row after the query returns, against
 * whatever page of results was asked for.
 *
 * Only `ACTIVE` postings are queried — freshness (M3) already decides which
 * postings that status covers, and search does not re-derive it. An
 * opted-out employer is excluded from the database query itself, not
 * filtered afterward, so it never occupies a page slot a real result could
 * have used.
 */

export interface SearchResultItem {
  id: string;
  title: string;
  employer: string;
  canonicalUrl: string;
  locationRaw: string | null;
  isRemote: boolean | null;
  contractType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  skillsRaw: string[];
  publishedAt: string | null;
  freshnessLabel: string | null;
  sourceName: string;
  attributionText: string | null;
  eligibility: EligibilityResult | null;
}

export interface SearchResult {
  items: SearchResultItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  /** Whether eligibility was evaluated at all — false when the candidate has
   *  no confirmed profile yet, so the UI can explain rather than imply
   *  everything is eligible. */
  eligibilityAvailable: boolean;
  /** ACTIVE postings across every source, ignoring the current filters. Lets
   *  the UI tell "no postings are loaded at all" apart from "your filters
   *  matched nothing". */
  activePostingsTotal: number;
}

function isAgeing(publishedAt: Date | null): boolean {
  if (!publishedAt) return false;
  const days = (Date.now() - publishedAt.getTime()) / (24 * 60 * 60 * 1000);
  return days >= AGEING_AFTER_DAYS;
}

export async function searchJobs(workspaceId: string, query: SearchQuery): Promise<SearchResult> {
  const db = getJobmatchDb();
  const confirmed = await getConfirmedVersion(workspaceId);

  // Employers the candidate opted out of are excluded from the query itself,
  // never merely filtered after — see isOptedOut's own reasoning for why an
  // opt-out must not even surface as an annotated result.
  const excludedEmployers = confirmed?.content.preferences.excludedEmployers ?? [];

  const where = {
    status: "ACTIVE" as const,
    ...(query.q
      ? {
          OR: [
            { title: { contains: query.q, mode: "insensitive" as const } },
            { employer: { contains: query.q, mode: "insensitive" as const } },
            { description: { contains: query.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(query.location ? { locationRaw: { contains: query.location, mode: "insensitive" as const } } : {}),
    ...(query.remote && query.remote !== "any"
      ? { isRemote: query.remote === "remote" }
      : {}),
    ...(query.contractType
      ? { contractType: { contains: query.contractType, mode: "insensitive" as const } }
      : {}),
    ...(query.salaryMin ? { salaryMax: { gte: query.salaryMin } } : {}),
    ...(query.skills && query.skills.length > 0 ? { skillsRaw: { hasSome: query.skills } } : {}),
    ...(excludedEmployers.length > 0
      ? { employerKey: { notIn: excludedEmployers.map(foldEmployerName) } }
      : {}),
  };

  const orderBy =
    query.sort === "salary"
      ? [{ salaryMax: "desc" as const }, { publishedAt: "desc" as const }]
      : [{ publishedAt: "desc" as const }, { firstSeenAt: "desc" as const }];

  const [rows, totalCount, activePostingsTotal] = await Promise.all([
    db.jobPosting.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        title: true,
        employer: true,
        canonicalUrl: true,
        locationRaw: true,
        isRemote: true,
        contractType: true,
        salaryMin: true,
        salaryMax: true,
        salaryCurrency: true,
        salaryPeriod: true,
        skillsRaw: true,
        publishedAt: true,
        requiresSponsorship: true,
        languageRequired: true,
        requiredCertifications: true,
        source: { select: { name: true, attributionText: true } },
      },
    }),
    db.jobPosting.count({ where }),
    db.jobPosting.count({ where: { status: "ACTIVE" } }),
  ]);

  // The employerKey filter above is exact and DB-level (both sides folded
  // the same way), so no further in-app opt-out filtering is needed here --
  // doing it after findMany/count would shrink an already-paginated page and
  // overstate totalCount.
  const items = rows
    .map((row) => ({
      id: row.id,
      title: row.title,
      employer: row.employer,
      canonicalUrl: row.canonicalUrl,
      locationRaw: row.locationRaw,
      isRemote: row.isRemote,
      contractType: row.contractType,
      salaryMin: row.salaryMin,
      salaryMax: row.salaryMax,
      salaryCurrency: row.salaryCurrency,
      salaryPeriod: row.salaryPeriod,
      skillsRaw: row.skillsRaw,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      // The query already restricts to ACTIVE postings, so EXPIRED,
      // WITHDRAWN and DISAPPEARED never reach here — the only real question
      // left is whether this one is old enough to earn the AGEING label.
      // freshnessLabel trusts the state its caller passes rather than
      // re-deriving it, so the age check has to happen here first.
      freshnessLabel: isAgeing(row.publishedAt)
        ? freshnessLabel("AGEING", row.publishedAt)
        : null,
      sourceName: row.source.name,
      attributionText: row.source.attributionText,
      eligibility: confirmed
        ? evaluateEligibility(confirmed.content, {
            employer: row.employer,
            locationRaw: row.locationRaw,
            isRemote: row.isRemote,
            contractType: row.contractType,
            salaryMin: row.salaryMin,
            salaryMax: row.salaryMax,
            salaryCurrency: row.salaryCurrency,
            salaryPeriod: row.salaryPeriod,
            requiresSponsorship: row.requiresSponsorship,
            languageRequired: row.languageRequired,
            requiredCertifications: row.requiredCertifications,
          })
        : null,
    }));

  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    totalCount,
    eligibilityAvailable: confirmed !== null,
    activePostingsTotal,
  };
}
