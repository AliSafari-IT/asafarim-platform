import type { Metadata } from "next";
import { Alert, Button, EmptyState, Metric, PageHeader } from "@asafarim/ui";
import { formatMicros } from "@asafarim/ai-cost-ledger";
import { getJobmatchDb } from "../../lib/db/client";
import { CostRangeTooLargeError, buildCostTimeline } from "../../lib/costs/read";
import { RESUMATCH_OPERATIONS, parseCostQuery } from "../../lib/costs/query";
import { coveragePercent, operationLabel } from "../../lib/costs/format";
import { getCurrentWorkspace } from "../../lib/workspace";
import { CostGroupList, CostTimelineList } from "./CostLists";
import { RangeNote } from "./LocalTime";

export const metadata: Metadata = { title: "AI usage" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const PRESETS: [string, string][] = [
  ["7d", "Last 7 days"],
  ["30d", "Last 30 days"],
  ["90d", "Last 90 days"],
  ["month", "This month"],
  ["prev_month", "Last month"],
  ["year", "This year"],
  ["custom", "Custom range"],
];

const STATUSES: [string, string][] = [
  ["", "Any cost status"],
  ["estimated", "Estimated"],
  ["actual", "Actual"],
  ["unknown", "Not tracked"],
  ["fixture", "Free (fixture)"],
  ["legacy", "Legacy (not linked to a job)"],
];

/**
 * AI provider cost transparency for one candidate (issue #587). Server
 * render of the summary, job subtotals and first page of calls; the
 * filter form is a plain GET form, so every view is a shareable URL and
 * works before any JavaScript loads.
 */
export default async function AiUsagePage({ searchParams }: { searchParams: SearchParams }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return (
      <>
        <PageHeader kicker="AI usage" title="This account cannot open a workspace." />
        <Alert tone="warning">
          <strong>Account inactive.</strong> Your platform account is not active, so ResuMatch will not open a
          workspace for it.
        </Alert>
      </>
    );
  }

  const params = await searchParams;
  const parsed = parseCostQuery(params);
  const db = getJobmatchDb();

  const [jobs, providers] = await Promise.all([
    db.targetJob.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true, title: true, employer: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.aiCostEvent.findMany({
      where: { workspaceId: workspace.id },
      select: { provider: true, responseModel: true },
      distinct: ["provider", "responseModel"],
      take: 50,
    }),
  ]);

  let timeline: Awaited<ReturnType<typeof buildCostTimeline>> | null = null;
  let rangeError: string | null = null;
  try {
    timeline = await buildCostTimeline(workspace.id, parsed.filter, { cursor: null, limit: parsed.limit });
  } catch (error) {
    if (!(error instanceof CostRangeTooLargeError)) throw error;
    rangeError = error.message;
  }

  // The same filter, minus pagination, for the client drill-downs.
  const baseQuery = new URLSearchParams(
    Object.entries({
      preset: parsed.values.preset,
      ...(parsed.values.preset === "custom" ? { from: parsed.values.from, to: parsed.values.to } : {}),
      job: parsed.values.job,
      operation: parsed.values.operation,
      provider: parsed.values.provider,
      model: parsed.values.model,
      status: parsed.values.status,
    }).filter(([, v]) => v),
  ).toString();

  const filteredJob = parsed.values.job ? jobs.find((j) => j.id === parsed.values.job) : null;
  const models = [...new Set(providers.map((p) => p.responseModel))].sort();
  const providerNames = [...new Set(providers.map((p) => p.provider))].sort();

  return (
    <>
      <PageHeader
        kicker="AI usage"
        title="AI provider cost"
        description="What the AI providers charged for the work ResuMatch did for you — per job, per step, and in total."
      />

      <Alert tone="info">
        <strong>Provider cost transparency, not a bill.</strong> These are the amounts AI providers charge for
        calls made on your behalf. ResuMatch does not charge you for them and this is not an invoice. Estimated
        amounts use each provider&apos;s published price at the time of the call.
      </Alert>

      <form method="get" className="rm-cost-filters" aria-label="Filter AI usage">
        <label className="jm-field">
          <span>Period</span>
          <select name="preset" defaultValue={parsed.values.preset}>
            {PRESETS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="jm-field">
          <span>From (custom)</span>
          <input type="date" name="from" defaultValue={parsed.values.preset === "custom" ? parsed.values.from : ""} />
        </label>
        <label className="jm-field">
          <span>To (custom)</span>
          <input type="date" name="to" defaultValue={parsed.values.preset === "custom" ? parsed.values.to : ""} />
        </label>
        <label className="jm-field">
          <span>Job / application</span>
          <select name="job" defaultValue={parsed.values.job}>
            <option value="">All jobs</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {[job.title ?? "Untitled job", job.employer].filter(Boolean).join(" · ")}
              </option>
            ))}
          </select>
        </label>
        <label className="jm-field">
          <span>Step</span>
          <select name="operation" defaultValue={parsed.values.operation}>
            <option value="">All steps</option>
            {RESUMATCH_OPERATIONS.map((op) => (
              <option key={op} value={op}>
                {operationLabel(op)}
              </option>
            ))}
          </select>
        </label>
        <label className="jm-field">
          <span>Provider</span>
          <select name="provider" defaultValue={parsed.values.provider}>
            <option value="">All providers</option>
            {providerNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="jm-field">
          <span>Model</span>
          <select name="model" defaultValue={parsed.values.model}>
            <option value="">All models</option>
            {models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>
        <label className="jm-field">
          <span>Cost status</span>
          <select name="status" defaultValue={parsed.values.status}>
            {STATUSES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="rm-cost-filters__actions">
          <Button type="submit" size="sm">
            Apply
          </Button>
          <a href="/ai-usage" className="rm-cost-filters__reset">
            Reset
          </a>
        </div>
      </form>

      {rangeError || !timeline ? (
        <Alert tone="warning">{rangeError}</Alert>
      ) : (
        <>
          <RangeNote from={timeline.range.from} to={timeline.range.to} />
          {filteredJob === undefined && parsed.values.job ? (
            <Alert tone="info">That job isn&apos;t in your workspace, so there is nothing to show for it.</Alert>
          ) : null}
          <Summary timeline={timeline} />

          {timeline.summary.eventCount === 0 ? (
            <EmptyState
              title="No AI usage in this period"
              description="Tailoring a CV, drafting a cover letter or reading a job page with AI will show up here, step by step."
            />
          ) : (
            <>
              <section className="rm-cost-section" aria-labelledby="rm-cost-by-job">
                <h2 id="rm-cost-by-job">By job</h2>
                <p className="rm-cost-section__hint">
                  Every call is counted in exactly one group, so these subtotals add up to the total above. Open a
                  group to see its calls.
                </p>
                <CostGroupList baseQuery={baseQuery} groups={timeline.groups} />
              </section>

              <section className="rm-cost-section" aria-labelledby="rm-cost-timeline">
                <h2 id="rm-cost-timeline">Every call</h2>
                <CostTimelineList baseQuery={baseQuery} items={timeline.items} nextCursor={timeline.nextCursor} />
              </section>
            </>
          )}
        </>
      )}
    </>
  );
}

function Summary({ timeline }: { timeline: NonNullable<Awaited<ReturnType<typeof buildCostTimeline>>> }) {
  const s = timeline.summary;
  const coverage = coveragePercent(s.coverageBasisPoints);
  const fmt = new Intl.NumberFormat("en-US");
  const known = BigInt(s.effectiveKnownMicros);

  return (
    <>
      <div className="rm-cost-summary" role="group" aria-label="Summary for the selected period">
        <Metric
          label="AI provider cost"
          value={s.eventCount > 0 && s.knownCount === 0 ? "Not tracked" : formatMicros(known)}
          hint={`Estimated ${formatMicros(BigInt(s.estimatedMicros))} · Actual ${formatMicros(BigInt(s.actualMicros))}`}
        />
        <Metric
          label="Not tracked"
          value={`${fmt.format(s.unknownCount)} ${s.unknownCount === 1 ? "call" : "calls"}`}
          hint={coverage === null ? "No calls in this period" : `${coverage}% of calls have a known cost`}
        />
        <Metric label="AI calls" value={fmt.format(s.eventCount)} hint={s.fixtureCount ? `${s.fixtureCount} free (fixture)` : undefined} />
        <Metric label="Tokens in / out" value={`${fmt.format(s.inputTokens)} / ${fmt.format(s.outputTokens)}`} />
      </div>
      {s.eventCount > 0 && s.knownCount === 0 ? (
        <Alert tone="warning">
          None of these calls could be priced, so there is no amount to show — that is &quot;not tracked&quot;, not
          free.
        </Alert>
      ) : s.coverage === "partial" ? (
        <Alert tone="info">
          Partially tracked:{" "}
          {s.unknownCount > 0 ? `${s.unknownCount} ${s.unknownCount === 1 ? "call has" : "calls have"} no known cost` : null}
          {s.unknownCount > 0 && s.legacyCount > 0 ? " and " : null}
          {s.legacyCount > 0
            ? `${s.legacyCount} earlier ${s.legacyCount === 1 ? "call was" : "calls were"} recorded before per-job tracking`
            : null}
          . The total above only includes amounts that are known.
        </Alert>
      ) : null}
    </>
  );
}
