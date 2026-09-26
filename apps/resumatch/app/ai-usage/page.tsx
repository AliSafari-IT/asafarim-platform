import type { Metadata } from "next";
import { Alert, Button, EmptyState, Metric, PageHeader } from "@asafarim/ui";
import { formatMicros } from "@asafarim/ai-cost-ledger";
import { getJobmatchDb } from "../../lib/db/client";
import { getTranslator } from "../../lib/i18n-server";
import { CostRangeTooLargeError, buildCostTimeline } from "../../lib/costs/read";
import { RESUMATCH_OPERATIONS, parseCostQuery } from "../../lib/costs/query";
import { coveragePercent, operationLabel, type Translate } from "../../lib/costs/format";
import { getCurrentWorkspace } from "../../lib/workspace";
import { CostGroupList, CostTimelineList } from "./CostLists";
import { RangeNote } from "./LocalTime";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("resumatch.cost.metaTitle") };
}
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Period presets; each is labelled by resumatch.cost.preset.<value>. */
const PRESETS = ["7d", "30d", "90d", "month", "prev_month", "year", "custom"];

/** Cost-status filter values; "" is "any" (resumatch.cost.statusFilter.<value>). */
const STATUSES = ["", "estimated", "actual", "unknown", "fixture", "legacy"];

/**
 * AI provider cost transparency for one candidate (issue #587). Server
 * render of the summary, job subtotals and first page of calls; the
 * filter form is a plain GET form, so every view is a shareable URL and
 * works before any JavaScript loads.
 */
export default async function AiUsagePage({ searchParams }: { searchParams: SearchParams }) {
  const { t, locale } = await getTranslator();
  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return (
      <>
        <PageHeader kicker={t("resumatch.cost.kicker")} title={t("resumatch.inactive.title")} />
        <Alert tone="warning">
          <strong>{t("resumatch.inactive.strong")}</strong> {t("resumatch.inactive.body")}
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
    rangeError = t("resumatch.cost.rangeTooLarge");
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
        kicker={t("resumatch.cost.kicker")}
        title={t("resumatch.cost.title")}
        description={t("resumatch.cost.description")}
      />

      <Alert tone="info">
        <strong>{t("resumatch.cost.notBill.strong")}</strong> {t("resumatch.cost.notBill.body")}
      </Alert>

      <form method="get" className="rm-cost-filters" aria-label={t("resumatch.cost.filtersAria")}>
        <label className="jm-field">
          <span>{t("resumatch.cost.period")}</span>
          <select name="preset" defaultValue={parsed.values.preset}>
            {PRESETS.map((value) => (
              <option key={value} value={value}>
                {t(`resumatch.cost.preset.${value}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="jm-field">
          <span>{t("resumatch.cost.from")}</span>
          <input type="date" name="from" defaultValue={parsed.values.preset === "custom" ? parsed.values.from : ""} />
        </label>
        <label className="jm-field">
          <span>{t("resumatch.cost.to")}</span>
          <input type="date" name="to" defaultValue={parsed.values.preset === "custom" ? parsed.values.to : ""} />
        </label>
        <label className="jm-field">
          <span>{t("resumatch.cost.job")}</span>
          <select name="job" defaultValue={parsed.values.job}>
            <option value="">{t("resumatch.cost.allJobs")}</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {[job.title ?? t("resumatch.untitledJob"), job.employer].filter(Boolean).join(" · ")}
              </option>
            ))}
          </select>
        </label>
        <label className="jm-field">
          <span>{t("resumatch.cost.step")}</span>
          <select name="operation" defaultValue={parsed.values.operation}>
            <option value="">{t("resumatch.cost.allSteps")}</option>
            {RESUMATCH_OPERATIONS.map((op) => (
              <option key={op} value={op}>
                {operationLabel(op, t)}
              </option>
            ))}
          </select>
        </label>
        <label className="jm-field">
          <span>{t("resumatch.cost.provider")}</span>
          <select name="provider" defaultValue={parsed.values.provider}>
            <option value="">{t("resumatch.cost.allProviders")}</option>
            {providerNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="jm-field">
          <span>{t("resumatch.cost.model")}</span>
          <select name="model" defaultValue={parsed.values.model}>
            <option value="">{t("resumatch.cost.allModels")}</option>
            {models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>
        <label className="jm-field">
          <span>{t("resumatch.cost.statusFilter")}</span>
          <select name="status" defaultValue={parsed.values.status}>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(`resumatch.cost.statusFilter.${value || "any"}`)}
              </option>
            ))}
          </select>
        </label>
        <div className="rm-cost-filters__actions">
          <Button type="submit" size="sm">
            {t("resumatch.cost.apply")}
          </Button>
          <a href="/ai-usage" className="rm-cost-filters__reset">
            {t("resumatch.cost.reset")}
          </a>
        </div>
      </form>

      {rangeError || !timeline ? (
        <Alert tone="warning">{rangeError}</Alert>
      ) : (
        <>
          <RangeNote from={timeline.range.from} to={timeline.range.to} />
          {filteredJob === undefined && parsed.values.job ? (
            <Alert tone="info">{t("resumatch.cost.jobNotInWorkspace")}</Alert>
          ) : null}
          <Summary timeline={timeline} t={t} locale={locale} />

          {timeline.summary.eventCount === 0 ? (
            <EmptyState
              title={t("resumatch.cost.empty.title")}
              description={t("resumatch.cost.empty.body")}
            />
          ) : (
            <>
              <section className="rm-cost-section" aria-labelledby="rm-cost-by-job">
                <h2 id="rm-cost-by-job">{t("resumatch.cost.byJob.title")}</h2>
                <p className="rm-cost-section__hint">{t("resumatch.cost.byJob.hint")}</p>
                <CostGroupList baseQuery={baseQuery} groups={timeline.groups} />
              </section>

              <section className="rm-cost-section" aria-labelledby="rm-cost-timeline">
                <h2 id="rm-cost-timeline">{t("resumatch.cost.everyCall")}</h2>
                <CostTimelineList baseQuery={baseQuery} items={timeline.items} nextCursor={timeline.nextCursor} />
              </section>
            </>
          )}
        </>
      )}
    </>
  );
}

function Summary({
  timeline,
  t,
  locale,
}: {
  timeline: NonNullable<Awaited<ReturnType<typeof buildCostTimeline>>>;
  t: Translate;
  locale: string;
}) {
  const s = timeline.summary;
  const coverage = coveragePercent(s.coverageBasisPoints);
  const fmt = new Intl.NumberFormat(locale);
  const money = (micros: string) => formatMicros(BigInt(micros), { locale });
  const plural = (key: string, count: number) =>
    t(`${key}.${count === 1 ? "one" : "other"}`, { count: fmt.format(count) });

  return (
    <>
      <div className="rm-cost-summary" role="group" aria-label={t("resumatch.cost.summaryAria")}>
        <Metric
          label={t("resumatch.cost.metric.cost")}
          value={s.eventCount > 0 && s.knownCount === 0 ? t("resumatch.cost.metric.notTracked") : money(s.effectiveKnownMicros)}
          hint={t("resumatch.cost.metric.costHint", { estimated: money(s.estimatedMicros), actual: money(s.actualMicros) })}
        />
        <Metric
          label={t("resumatch.cost.metric.notTracked")}
          value={plural("resumatch.cost.calls", s.unknownCount)}
          hint={
            coverage === null
              ? t("resumatch.cost.metric.noCalls")
              : t("resumatch.cost.metric.coverageHint", { percent: coverage })
          }
        />
        <Metric
          label={t("resumatch.cost.metric.calls")}
          value={fmt.format(s.eventCount)}
          hint={s.fixtureCount ? t("resumatch.cost.metric.fixtureHint", { count: s.fixtureCount }) : undefined}
        />
        <Metric
          label={t("resumatch.cost.metric.tokens")}
          value={`${fmt.format(s.inputTokens)} / ${fmt.format(s.outputTokens)}`}
        />
      </div>
      {s.eventCount > 0 && s.knownCount === 0 ? (
        <Alert tone="warning">{t("resumatch.cost.nonePriced")}</Alert>
      ) : s.coverage === "partial" ? (
        <Alert tone="info">
          {t("resumatch.cost.partial.lead")}{" "}
          {[
            s.unknownCount > 0 ? plural("resumatch.cost.partial.unknown", s.unknownCount) : null,
            s.legacyCount > 0 ? plural("resumatch.cost.partial.legacy", s.legacyCount) : null,
          ]
            .filter(Boolean)
            .join(t("resumatch.cost.partial.and"))}
          . {t("resumatch.cost.partial.tail")}
        </Alert>
      ) : null}
    </>
  );
}
