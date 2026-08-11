import { NextResponse } from "next/server";
import { requireStudentAutoProvision } from "@/lib/server/profiles";
import { handleBriefError } from "@/lib/server/brief-errors";
import { compareProposals, describeDifferences } from "@/lib/server/brief-flow";
import {
  NEW_TUTOR_REVIEW_THRESHOLD,
  passesRatingFilter,
  type RatingFilterOptions,
} from "@/lib/server/brief-matching";

export const runtime = "nodejs";

/** Parses `?minRating=4.5` etc. into the shape passesRatingFilter() expects. */
function parseRatingFilters(searchParams: URLSearchParams): RatingFilterOptions {
  const filters: RatingFilterOptions = {};
  const read = (key: keyof RatingFilterOptions, param: string) => {
    const raw = searchParams.get(param);
    if (raw === null) return;
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) filters[key] = n;
  };
  read("minRating", "minRating");
  read("minClarity", "minClarity");
  read("minReliability", "minReliability");
  read("minEngagement", "minEngagement");
  return filters;
}

/**
 * GET /api/learning/briefs/[id]/proposals
 *
 * The comparison view: every proposal a tutor actually sent, described with
 * the same fields, plus factual notes on how they differ. Never a ranking or
 * a recommendation — see describeDifferences().
 *
 * Optional `minRating`/`minClarity`/`minReliability`/`minEngagement` query
 * params apply the minimum-rating filter server-side via
 * `passesRatingFilter()` — never excludes a tutor with fewer than
 * NEW_TUTOR_REVIEW_THRESHOLD reviews, overall or per-aspect, so a verified
 * newcomer is never silently erased from the comparison. `total` and
 * `hiddenCount`/`hiddenNewcomerCount` describe the *unfiltered* pool so the
 * caller (the compare page) can show "Z tutors hidden" without a second
 * request.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireStudentAutoProvision();
    const { id } = await params;
    const filters = parseRatingFilters(new URL(req.url).searchParams);
    const filtersActive = Object.keys(filters).length > 0;

    const proposals = await compareProposals(id, user.id);
    const items = filtersActive
      ? proposals.filter((p) => passesRatingFilter(p, filters))
      : proposals;

    const hiddenCount = proposals.length - items.length;
    const hiddenNewcomerCount = filtersActive
      ? proposals.filter(
          (p) => !items.includes(p) && p.ratingCount < NEW_TUTOR_REVIEW_THRESHOLD,
        ).length
      : 0;

    return NextResponse.json({
      items,
      total: proposals.length,
      differences: describeDifferences(items),
      hiddenCount,
      hiddenNewcomerCount,
    });
  } catch (error) {
    return handleBriefError("learning/briefs/[id]/proposals", error);
  }
}
