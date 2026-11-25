/**
 * Go/no-go decision for personalization rollout (#934).
 *
 * Inputs: the deterministic report (always), the provider run report and
 * the completed review sheet (when they exist). The decision is "go" only
 * when all of these hold:
 *
 * 1. Every deterministic gate passed on every case (isolation, scope,
 *    fixed facts, injection).
 * 2. A provider run exists and every call in it was reviewed.
 * 3. No reviewed candidate output is fabricated, and every fabrication
 *    screen hit was reviewed (a hit a reviewer marked "not fabricated" is
 *    allowed, an unreviewed hit is not).
 * 4. Candidate relevance and instruction adherence are each at least the
 *    baseline's (mean rubric score), so there is no regression.
 *
 * Edit burden is reported separately and never derived from acceptance:
 * it is the word-level edit distance between what the provider suggested
 * and what the reviewer would actually send, as a share of the suggestion.
 * It informs the decision but does not gate it.
 */

import type { DeterministicReport } from "./run";
import type { ProviderRunReport, ReviewItem } from "./provider";

export interface RubricSummary {
  reviewed: number;
  relevance: number;
  adherence: number;
  fabricated: number;
  editBurden: number;
}

export interface Decision {
  decision: "go" | "no-go";
  reasons: string[];
  deterministicGo: boolean;
  baseline: RubricSummary | null;
  candidate: RubricSummary | null;
}

function words(text: string | null | undefined): string[] {
  return (text ?? "").toLowerCase().split(/\s+/).filter(Boolean);
}

/** Word-level Levenshtein distance. */
export function wordDistance(a: string[], b: string[]): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}

/** Share of the suggestion the reviewer changed: 0 = sent as is, 1 = rewritten. */
export function editBurden(item: ReviewItem): number {
  const pairs: [string | null, string | null][] = [
    [item.suggested.headline, item.review.finalHeadline ?? item.suggested.headline],
    [item.suggested.summary, item.review.finalSummary ?? item.suggested.summary],
  ];
  item.suggested.bullets.forEach((list, i) => {
    const finals = item.review.finalBullets?.[i] ?? list;
    pairs.push([list.join("\n"), finals.join("\n")]);
  });
  let changed = 0;
  let total = 0;
  for (const [s, f] of pairs) {
    const sw = words(s);
    changed += wordDistance(sw, words(f));
    total += sw.length;
  }
  return total === 0 ? 0 : Math.min(1, changed / total);
}

const mean = (xs: number[]) => (xs.length === 0 ? 0 : Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1000) / 1000);

export function summarizeReview(items: ReviewItem[], variant: "baseline" | "candidate"): RubricSummary {
  const done = items.filter((i) => i.variant === variant && i.review.relevance !== null && i.review.adherence !== null && i.review.fabricated !== null);
  return {
    reviewed: done.length,
    relevance: mean(done.map((i) => i.review.relevance!)),
    adherence: mean(done.map((i) => i.review.adherence!)),
    fabricated: done.filter((i) => i.review.fabricated).length,
    editBurden: mean(done.map(editBurden)),
  };
}

export function decide(deterministic: DeterministicReport, provider: ProviderRunReport | null, review: ReviewItem[] | null): Decision {
  const reasons: string[] = [];
  if (!deterministic.deterministicGo) reasons.push(`Deterministic gates failed for ${deterministic.gateFailures.length} case(s).`);
  if (!provider) reasons.push("No real-provider comparison has been run.");
  if (provider && provider.failures > 0) reasons.push(`${provider.failures} provider call(s) failed; rerun or explain them before deciding.`);
  if (!review) reasons.push("No human review sheet was supplied.");

  let baseline: RubricSummary | null = null;
  let candidate: RubricSummary | null = null;
  if (provider && review) {
    baseline = summarizeReview(review, "baseline");
    candidate = summarizeReview(review, "candidate");
    const okCalls = provider.records.filter((r) => r.ok);
    const unreviewed = okCalls.length - (baseline.reviewed + candidate.reviewed);
    if (unreviewed > 0) reasons.push(`${unreviewed} provider output(s) are not reviewed yet.`);
    if (candidate.fabricated > 0) reasons.push(`${candidate.fabricated} reviewed candidate output(s) contain a fabricated qualification.`);
    const reviewedIds = new Set(review.filter((i) => i.review.fabricated !== null).map((i) => `${i.id}:${i.variant}`));
    const unreviewedHits = provider.records.filter((r) => r.fabricationScreen && !reviewedIds.has(`${r.id}:${r.variant}`)).length;
    if (unreviewedHits > 0) reasons.push(`${unreviewedHits} fabrication screen hit(s) are not reviewed.`);
    if (candidate.relevance < baseline.relevance) reasons.push("Candidate relevance is below baseline.");
    if (candidate.adherence < baseline.adherence) reasons.push("Candidate instruction adherence is below baseline.");
  }

  return { decision: reasons.length === 0 ? "go" : "no-go", reasons, deterministicGo: deterministic.deterministicGo, baseline, candidate };
}
