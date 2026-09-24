import { EmptyState, Metric } from "@asafarim/ui";
import { formatMicros, type CostTotalsDTO } from "@asafarim/ai-cost-ledger";
import { requireMembership } from "../../../../../lib/workspace-access";
import { getTasksAiDb } from "../../../../../lib/db/client";
import type { RequestContext } from "../../../../../lib/context";
import { buildCostTimeline, authorizedProjectIds, CostRangeTooLargeError } from "../../../../../lib/ai/cost/read";
import { parseCostQuery } from "../../../../../lib/ai/cost/query";
import { KIND_LABELS } from "../../../../../lib/ai/cost/format";
import { usageSummary } from "../../../../../lib/ai/quota";
import { Drilldown, RangeNote, RunList } from "./CostClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI cost" };

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
  ["legacy", "Legacy"],
];

function money(t: CostTotalsDTO) {
  if (t.eventCount > 0 && t.knownCount === 0) return "Not tracked";
  return formatMicros(BigInt(t.effectiveKnownMicros));
}

function coverage(t: CostTotalsDTO) {
  return t.coverageBasisPoints === null ? "no runs" : `${Math.floor(t.coverageBasisPoints / 100)}% priced`;
}

/**
 * Workspace AI provider cost (issue #591). Provider cost only — plan
 * allowances stay in Settings → Billing (UsageMeter) and are never used
 * to compute anything here. Owner/admin see the workspace; members and
 * guests see only projects they are authorized for (plus their own
 * workspace-level runs). No per-person ranking exists anywhere on it.
 */
export default async function AiCostPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const m = await requireMembership(slug);
  const ctx: RequestContext = {
    db: getTasksAiDb(),
    workspaceId: m.workspaceId,
    workspaceSlug: slug,
    actor: { membershipId: m.membershipId, platformUserId: m.platformUserId, role: m.role },
    correlationId: "page",
  };
  const parsed = parseCostQuery(await searchParams);
  const isAdmin = m.role === "owner" || m.role === "admin";

  const allowed = await authorizedProjectIds(ctx);
  const [projects, budget] = await Promise.all([
    ctx.db.project.findMany({
      where: { workspaceId: ctx.workspaceId, ...(allowed ? { id: { in: [...allowed] } } : {}) },
      select: { id: true, key: true, name: true },
      orderBy: { name: "asc" },
    }),
    isAdmin ? usageSummary(ctx) : Promise.resolve(null),
  ]);
  const projectNames = Object.fromEntries(projects.map((p) => [p.id, `${p.key} · ${p.name}`]));
  const task = parsed.filter.taskId
    ? await ctx.db.task.findFirst({ where: { id: parsed.filter.taskId, workspaceId: ctx.workspaceId }, select: { id: true, title: true, projectId: true } })
    : null;

  let timeline: Awaited<ReturnType<typeof buildCostTimeline>> | null = null;
  let error: string | null = null;
  try {
    timeline = await buildCostTimeline(ctx, parsed.filter, { cursor: null, limit: parsed.limit });
  } catch (err) {
    if (!(err instanceof CostRangeTooLargeError)) throw err;
    error = err.message;
  }

  const base = new URLSearchParams(
    Object.entries({ ...parsed.values, ...(parsed.values.preset === "custom" ? {} : { from: "", to: "" }) }).filter(([, v]) => v),
  );
  const q = (extra: Record<string, string>) => {
    const p = new URLSearchParams(base);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    p.set("limit", "25");
    return p.toString();
  };
  const exportHref = `/api/v1/workspaces/${slug}/ai/costs/export?${base.toString()}`;
  const s = timeline?.summary;

  return (
    <section className="ta-tw ta-cost">
      <header className="ta-tw__head">
        <div>
          <h1>AI cost</h1>
          <p className="ta-tw__subtitle">
            What AI providers charged for the work Copilot did — per project, per task, and per run.
          </p>
        </div>
        <a className="ta-btn ta-btn--ghost" href={exportHref} download>
          Export CSV
        </a>
      </header>

      <p className="ta-cost__notice" role="note">
        <strong>AI provider cost, not your bill.</strong> These are the providers&apos; list prices for the
        calls made on this workspace&apos;s behalf — not an invoice, and not your plan&apos;s allowance. Plan
        usage (how many proposals your plan includes) lives in{" "}
        <a className="ta-link" href={`/w/${slug}/settings?tab=billing`}>
          Settings → Billing
        </a>
        .{" "}
        {timeline?.scope === "authorized_projects"
          ? "You are seeing projects you have access to and your own workspace-level runs."
          : null}
      </p>

      <form method="get" className="ta-cost__filters" aria-label="Filter AI cost">
        <label>
          <span>Period</span>
          <select name="preset" defaultValue={parsed.values.preset}>
            {PRESETS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>From</span>
          <input type="date" name="from" defaultValue={parsed.values.preset === "custom" ? parsed.values.from : ""} />
        </label>
        <label>
          <span>To</span>
          <input type="date" name="to" defaultValue={parsed.values.preset === "custom" ? parsed.values.to : ""} />
        </label>
        <label>
          <span>Project</span>
          <select name="project" defaultValue={parsed.values.project}>
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.key} · {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Run type</span>
          <select name="operation" defaultValue={parsed.values.operation}>
            <option value="">All run types</option>
            {Object.entries(KIND_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Provider</span>
          <select name="provider" defaultValue={parsed.values.provider}>
            <option value="">All providers</option>
            {["anthropic", "openai", "fixture"].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Cost status</span>
          <select name="status" defaultValue={parsed.values.status}>
            {STATUSES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="ta-cost__check">
          <input type="checkbox" name="mine" value="1" defaultChecked={parsed.values.mine === "1"} />
          <span>My AI activity only</span>
        </label>
        {parsed.values.task ? <input type="hidden" name="task" value={parsed.values.task} /> : null}
        <div className="ta-cost__actions">
          <button type="submit" className="ta-btn">
            Apply
          </button>
          <a className="ta-link" href={`/w/${slug}/analytics/ai-costs`}>
            Reset
          </a>
        </div>
      </form>

      {task ? (
        <p className="ta-cost__notice">
          Showing runs attributed directly to <strong>{task.title}</strong>. Shared project runs that created or
          touched this task are listed in the task&apos;s own panel and counted once, on its project.{" "}
          <a className="ta-link" href={`/w/${slug}/analytics/ai-costs?${new URLSearchParams({ project: task.projectId }).toString()}`}>
            See the whole project
          </a>
        </p>
      ) : null}

      {error || !timeline || !s ? (
        <p role="alert">{error}</p>
      ) : (
        <>
          <RangeNote from={timeline.range.from} to={timeline.range.to} />
          <div className="ta-metrics">
            <Metric label="AI provider cost" value={money(s)} hint={`Estimated ${formatMicros(BigInt(s.estimatedMicros))} · Actual ${formatMicros(BigInt(s.actualMicros))}`} />
            <Metric label="Not tracked" value={`${s.unknownCount} runs`} hint={coverage(s)} />
            <Metric label="AI runs" value={String(s.eventCount)} hint={s.fixtureCount ? `${s.fixtureCount} free (fixture)` : undefined} />
            <Metric
              label="Tokens in / out"
              value={`${new Intl.NumberFormat("en-US").format(s.inputTokens)} / ${new Intl.NumberFormat("en-US").format(s.outputTokens)}`}
            />
            {budget && budget.budgetUsd != null ? (
              <Metric
                label="Monthly AI budget"
                value={`$${budget.monthUsd.toFixed(2)} of $${budget.budgetUsd.toFixed(2)}`}
                hint="This month, from AI settings"
              />
            ) : null}
          </div>

          {s.eventCount > 0 && s.knownCount === 0 ? (
            <p className="ta-cost__notice">None of these runs could be priced — that is &quot;not tracked&quot;, not free.</p>
          ) : s.coverage === "partial" ? (
            <p className="ta-cost__notice">
              Partially tracked: {s.unknownCount} run(s) have no known cost and {s.legacyCount} were recorded before
              per-project tracking. Totals include only known amounts.
            </p>
          ) : null}

          {s.eventCount === 0 ? (
            <EmptyState
              glyph="[ $ ]"
              title="No AI runs in this period"
              description="Plans, breakdowns and summaries drafted by Copilot show up here with what the provider charged for each."
              action={
                <a className="ta-link" href={`/w/${slug}/copilot`}>
                  Open Copilot
                </a>
              }
            />
          ) : (
            <>
              <h3>By project</h3>
              <p className="ta-muted">
                Each run is counted once. A run started from a single task is a <em>direct task run</em>; a plan or
                breakdown that creates or touches several tasks is a <em>shared project run</em> — counted on the
                project, never split or copied onto its tasks.
              </p>
              <div className="ta-cost__scroll">
                <table className="ta-table">
                  <thead>
                    <tr>
                      <th scope="col">Project</th>
                      <th scope="col">Direct task runs</th>
                      <th scope="col">Shared project runs</th>
                      <th scope="col">Coverage</th>
                      <th scope="col" className="ta-cost__amount">
                        Subtotal
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {timeline.projects.map((p) => (
                      <tr key={p.projectId}>
                        <td>
                          <a className="ta-link" href={`/w/${slug}/analytics/ai-costs?${q({ project: p.projectId })}`}>
                            {projectNames[p.projectId] ?? p.name}
                          </a>
                          {p.archived ? <span className="ta-badge ta-cost__badge">Archived</span> : null}
                          <Drilldown slug={slug} query={q({ project: p.projectId })} projects={projectNames} label="Show runs" />
                        </td>
                        <td>
                          {money(p.directTaskRuns)} <span className="ta-muted">({p.directTaskRuns.eventCount})</span>
                        </td>
                        <td>
                          {money(p.sharedRuns)} <span className="ta-muted">({p.sharedRuns.eventCount})</span>
                        </td>
                        <td>{coverage(p.totals)}</td>
                        <td className="ta-cost__amount">{money(p.totals)}</td>
                      </tr>
                    ))}
                    {timeline.workspaceOnly.eventCount > 0 ? (
                      <tr>
                        <td>Workspace-wide (no project)</td>
                        <td>—</td>
                        <td>—</td>
                        <td>{coverage(timeline.workspaceOnly)}</td>
                        <td className="ta-cost__amount">{money(timeline.workspaceOnly)}</td>
                      </tr>
                    ) : null}
                    {timeline.legacy.eventCount > 0 ? (
                      <tr>
                        <td>Earlier usage (before per-project tracking)</td>
                        <td>—</td>
                        <td>—</td>
                        <td>Legacy</td>
                        <td className="ta-cost__amount">{money(timeline.legacy)}</td>
                      </tr>
                    ) : null}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row" colSpan={4}>
                        Total
                      </th>
                      <td className="ta-cost__amount">{money(s)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <h3>Every run</h3>
              <RunList
                slug={slug}
                query={q({})}
                initial={{ items: timeline.items, nextCursor: timeline.nextCursor }}
                projects={projectNames}
                caption="AI runs, newest first"
              />
            </>
          )}
        </>
      )}
    </section>
  );
}
