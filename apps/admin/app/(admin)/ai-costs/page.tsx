import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ROLES, hasPermission, requireRole } from "@asafarim/auth";
import { ALL_MODELS, enumerateDays, formatMicros, trailingWindow, type ReconciliationStatus } from "@asafarim/ai-cost-ledger";
import { Badge, Button, DataTable, EmptyState, PageHeader, type BadgeTone, type ColumnDef } from "@asafarim/ui";
import { loadRecentRuns, loadReport, type ReportLine, type RunRow } from "../../../lib/server/ai-cost-reconciliation/store";
import { runAiCostReconciliation } from "./actions";

export const metadata: Metadata = { title: "AI Costs" };
export const dynamic = "force-dynamic";

/**
 * AI cost reconciliation report (#592): provider-reported daily cost vs.
 * the sum of the apps' internal AI cost events, per provider account, UTC
 * day and model. Amounts and counts only — no user, project or task, and
 * the unattributed remainder is shown at provider/day level, never spread.
 */

const WINDOWS = [7, 14, 31] as const;

const STATUS: Record<ReconciliationStatus, { tone: BadgeTone; label: string }> = {
  matched: { tone: "success", label: "matched" },
  under_recorded: { tone: "warning", label: "under-recorded" },
  over_recorded: { tone: "warning", label: "over-recorded" },
  provider_only: { tone: "danger", label: "provider only" },
  internal_only: { tone: "danger", label: "internal only" },
  empty: { tone: "neutral", label: "no spend" },
  pending: { tone: "info", label: "pending" },
  no_provider_api: { tone: "neutral", label: "no provider API" },
  provider_unavailable: { tone: "warning", label: "provider unreachable" },
  internal_unavailable: { tone: "warning", label: "app unreachable" },
};

const STATUS_HELP: [ReconciliationStatus, string][] = [
  ["matched", "Internal total is within the drift threshold of the provider's figure."],
  ["under_recorded", "Provider billed more than the apps recorded; the gap is unattributed spend."],
  ["over_recorded", "Apps recorded more than the provider billed — usually a price-table estimate running high."],
  ["provider_only", "Provider billed spend no app recorded at all."],
  ["internal_only", "Apps recorded platform-key spend the provider reports nothing for."],
  ["pending", "Day is inside the 48-hour settle window; numbers can still move and drift is not judged."],
  ["no_provider_api", "No admin key configured, or the provider has no cost-report API. Not a green result."],
];

function money(v: bigint | null): string {
  return v === null ? "—" : formatMicros(v);
}

function pct(bps: number | null): string {
  return bps === null ? "—" : `${(bps / 100).toFixed(1)}%`;
}

function when(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function StatusBadge({ status }: { status: ReconciliationStatus }) {
  const s = STATUS[status] ?? { tone: "neutral" as BadgeTone, label: status };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

function href(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, String(v));
  return `/ai-costs?${q.toString()}`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div
      style={{
        padding: "var(--space-3)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        background: "var(--surface-1)",
        minWidth: 0,
      }}
    >
      <div className="u-muted" style={{ fontSize: "var(--text-xs)" }}>{label}</div>
      <div className="u-mono" style={{ fontSize: "var(--text-lg)", marginTop: "var(--space-1)" }}>{value}</div>
      {hint ? <div className="u-muted" style={{ fontSize: "var(--text-xs)", marginTop: "var(--space-1)" }}>{hint}</div> : null}
    </div>
  );
}

function SourceList({ run }: { run: RunRow }) {
  return (
    <ul style={{ margin: 0, paddingLeft: "1rem", fontSize: "var(--text-sm)", display: "grid", gap: "var(--space-1)" }}>
      {run.sources.map((s) => (
        <li key={`${s.kind}:${s.key}`}>
          <span className="u-mono">{s.kind === "provider" ? s.key : `app ${s.key}`}</span>{" "}
          <Badge tone={s.status === "ok" ? "success" : s.status === "unsupported" ? "neutral" : "warning"}>
            {s.status === "ok" ? "fresh" : s.status === "unsupported" ? "no API" : "unavailable"}
          </Badge>{" "}
          <span className="u-muted">
            {s.status === "ok" ? `as of ${when(s.fetchedAt)}${s.pagesFetched ? ` · ${s.pagesFetched} page(s)` : ""}` : s.error}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default async function AiCostsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireRole([ROLES.ADMIN]);
  if (!(await hasPermission(session, "ai_costs.view"))) redirect("/denied");
  const canRun = await hasPermission(session, "ai_costs.reconcile");

  const params = await searchParams;
  const windowDays = WINDOWS.find((w) => String(w) === params.days) ?? 7;
  const window = trailingWindow(new Date(), windowDays);
  const days = enumerateDays(window.startDay, window.endDay).reverse();
  const provider = params.provider && /^[a-z0-9-]{1,40}$/.test(params.provider) ? params.provider : undefined;
  const drillDay = params.day && days.includes(params.day) ? params.day : undefined;

  const [report, runs] = await Promise.all([loadReport(days, { provider }), loadRecentRuns(10)]);
  const dayLines = report.filter((l) => l.modelKey === ALL_MODELS);
  const providers = [...new Set(dayLines.map((l) => l.provider))].sort();
  const lastRun = runs.find((r) => r.status !== "running") ?? null;
  const running = runs.some((r) => r.status === "running" && Date.now() - r.startedAt.getTime() < 15 * 60_000);

  // Headline numbers: settled days with a provider figure only — a pending
  // or "no API" day would otherwise read as coverage it doesn't have.
  const judged = dayLines.filter((l) => l.finality === "final" && l.providerMicros !== null);
  const sum = (xs: (bigint | null)[]) => xs.reduce<bigint>((a, b) => a + (b ?? BigInt("0")), BigInt("0"));
  const providerTotal = sum(judged.map((l) => l.providerMicros));
  const internalTotal = sum(judged.map((l) => l.internalKnownMicros));
  const unattributedTotal = sum(judged.map((l) => l.unattributedMicros));
  const unknownEvents = dayLines.reduce((a, l) => a + l.internalUnknownCount, 0);
  const driftDays = judged.filter((l) => ["under_recorded", "over_recorded", "provider_only", "internal_only"].includes(l.status)).length;
  const coverage = providerTotal > BigInt("0") ? Number((internalTotal * BigInt("10000")) / providerTotal) : null;

  const dayColumns: ColumnDef<ReportLine>[] = [
    { id: "day", header: "Day (UTC)", mono: true, nowrap: true, render: (l) => <a href={href({ days: windowDays, provider, day: l.day })}>{l.day}</a> },
    { id: "provider", header: "Provider", mono: true, render: (l) => l.provider },
    { id: "status", header: "Status", render: (l) => <StatusBadge status={l.status} /> },
    { id: "provider$", header: "Provider", align: "right", mono: true, render: (l) => money(l.providerMicros) },
    { id: "internal$", header: "Internal", align: "right", mono: true, render: (l) => money(l.internalKnownMicros) },
    { id: "delta", header: "Δ", align: "right", mono: true, render: (l) => money(l.deltaMicros) },
    { id: "unattributed", header: "Unattributed", align: "right", mono: true, render: (l) => money(l.unattributedMicros) },
    { id: "coverage", header: "Coverage", align: "right", mono: true, render: (l) => pct(l.coverageBps) },
    {
      id: "events",
      header: "Events",
      align: "right",
      mono: true,
      render: (l) => (
        <>
          {l.internalEventCount}
          {l.internalUnknownCount > 0 ? <span className="u-muted"> ({l.internalUnknownCount} unpriced)</span> : null}
        </>
      ),
    },
    { id: "apps", header: "Apps", render: (l) => (l.apps.length ? l.apps.join(", ") : <span className="u-muted">—</span>) },
    {
      id: "observed",
      header: "Observed",
      mono: true,
      nowrap: true,
      render: (l) => (
        <span title={l.history > 0 ? `${l.history} earlier observation(s) kept as history` : undefined}>
          {when(l.observedAt)}
          {l.history > 0 ? <span className="u-muted"> · rev {l.history + 1}</span> : null}
        </span>
      ),
    },
  ];

  const modelColumns: ColumnDef<ReportLine>[] = [
    { id: "provider", header: "Provider", mono: true, render: (l) => l.provider },
    { id: "model", header: "Model / service", mono: true, render: (l) => l.modelKey },
    ...dayColumns.slice(2, 9),
  ];

  const modelLines = drillDay ? report.filter((l) => l.day === drillDay && l.modelKey !== ALL_MODELS) : [];

  return (
    <>
      <PageHeader
        kicker="Finance"
        kickerIndex="AI"
        title="AI Cost Reconciliation"
        description="Provider-reported daily AI cost compared with what ResuMatch, Vionto and TasksAI recorded on the platform's own keys. Original cost events are never changed; drift and unattributed spend are reported here only."
        actions={
          canRun ? (
            <form action={runAiCostReconciliation} style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
              <input type="hidden" name="days" value={windowDays} />
              <Button type="submit" size="sm" disabled={running}>
                {running ? "Run in progress…" : `Reconcile last ${windowDays} days`}
              </Button>
            </form>
          ) : null
        }
      />

      {params.notice === "started" ? (
        <p role="status" style={{ marginBottom: "var(--space-3)" }}>
          <Badge tone="info">started</Badge> Reconciliation is running in the background — refresh in a minute.
        </p>
      ) : params.notice === "running" ? (
        <p role="status" style={{ marginBottom: "var(--space-3)" }}>
          <Badge tone="warning">busy</Badge> A reconciliation run is already in progress.
        </p>
      ) : null}

      <nav aria-label="Window and provider" style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", marginBottom: "var(--space-4)", fontSize: "var(--text-sm)" }}>
        {WINDOWS.map((w) => (
          <a key={w} href={href({ days: w, provider })} aria-current={w === windowDays ? "page" : undefined} style={{ fontWeight: w === windowDays ? 600 : undefined }}>
            {w} days
          </a>
        ))}
        <span className="u-muted">·</span>
        <a href={href({ days: windowDays })} style={{ fontWeight: provider ? undefined : 600 }}>all providers</a>
        {providers.map((p) => (
          <a key={p} href={href({ days: windowDays, provider: p })} style={{ fontWeight: p === provider ? 600 : undefined }}>
            {p}
          </a>
        ))}
      </nav>

      {dayLines.length === 0 ? (
        <EmptyState
          glyph="$ ?"
          title="No reconciliation data for this window"
          description={
            canRun
              ? "Run a reconciliation to compare provider cost reports with the apps' internal cost events."
              : "No run has covered these days yet. Runs are started by the scheduler or by an admin with the ai_costs.reconcile permission."
          }
        />
      ) : (
        <>
          <section
            aria-label="Settled-day totals"
            style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}
          >
            <Stat label="Provider billed" value={formatMicros(providerTotal)} hint={`${judged.length} settled provider-days`} />
            <Stat label="Recorded internally" value={formatMicros(internalTotal)} hint={`${pct(coverage)} coverage`} />
            <Stat label="Unattributed" value={formatMicros(unattributedTotal)} hint="Not spread across users or projects" />
            <Stat label="Drift days" value={String(driftDays)} hint={unknownEvents > 0 ? `${unknownEvents} unpriced events in window` : "outside threshold"} />
          </section>

          {drillDay ? (
            <section style={{ marginBottom: "var(--space-5)" }}>
              <h2 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-2)" }}>
                {drillDay} by model{" "}
                <a href={href({ days: windowDays, provider })} style={{ fontSize: "var(--text-sm)", fontWeight: 400 }}>close</a>
              </h2>
              <DataTable
                columns={modelColumns}
                rows={modelLines}
                getRowKey={(l) => `${l.provider}|${l.accountKey}|${l.modelKey}`}
                caption={`Per-model reconciliation for ${drillDay}`}
                empty={<EmptyState glyph="—" title="No model-level lines" description="Neither side reported spend for this day." />}
              />
              <p className="u-muted" style={{ fontSize: "var(--text-xs)", marginTop: "var(--space-2)" }}>
                Model names are matched after dropping snapshot dates. Non-model provider costs (web search, code execution) appear as <span className="u-mono">unmodeled</span> and are always unattributed.
              </p>
            </section>
          ) : null}

          <DataTable
            columns={dayColumns}
            rows={dayLines}
            getRowKey={(l) => `${l.provider}|${l.accountKey}|${l.day}`}
            caption="Daily reconciliation by provider"
          />
        </>
      )}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(18rem, 1fr))", gap: "var(--space-4)", marginTop: "var(--space-5)" }}>
        <div>
          <h2 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-2)" }}>Source freshness</h2>
          {lastRun ? (
            <>
              <p className="u-muted" style={{ fontSize: "var(--text-xs)", margin: "0 0 var(--space-2)" }}>
                Last run {when(lastRun.finishedAt ?? lastRun.startedAt)} · {lastRun.trigger} · {lastRun.status}
                {lastRun.error ? ` · ${lastRun.error}` : ""}
              </p>
              <SourceList run={lastRun} />
            </>
          ) : (
            <p className="u-muted">No runs yet.</p>
          )}
        </div>
        <div>
          <h2 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-2)" }}>Status key</h2>
          <dl style={{ margin: 0, display: "grid", gap: "var(--space-1)", fontSize: "var(--text-sm)" }}>
            {STATUS_HELP.map(([s, text]) => (
              <div key={s}>
                <dt style={{ display: "inline" }}><StatusBadge status={s} /></dt>{" "}
                <dd style={{ display: "inline", margin: 0 }} className="u-muted">{text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {runs.length > 0 ? (
        <section style={{ marginTop: "var(--space-5)" }}>
          <h2 style={{ fontSize: "var(--text-lg)", marginBottom: "var(--space-2)" }}>Recent runs</h2>
          <DataTable
            columns={[
              { id: "started", header: "Started", mono: true, nowrap: true, render: (r: RunRow) => when(r.startedAt) },
              { id: "trigger", header: "Trigger", render: (r: RunRow) => r.trigger },
              { id: "window", header: "Window", mono: true, nowrap: true, render: (r: RunRow) => `${r.startDay} → ${r.endDay}` },
              {
                id: "status",
                header: "Status",
                render: (r: RunRow) => (
                  <Badge tone={r.status === "succeeded" ? "success" : r.status === "running" ? "info" : r.status === "partial" ? "warning" : "danger"}>{r.status}</Badge>
                ),
              },
              { id: "inserted", header: "New lines", align: "right", mono: true, render: (r: RunRow) => String(r.summary?.insertedLines ?? "—") },
              { id: "drift", header: "New drift days", align: "right", mono: true, render: (r: RunRow) => String(r.summary?.newDriftDays ?? "—") },
            ]}
            rows={runs}
            getRowKey={(r) => r.id}
            caption="Recent reconciliation runs"
          />
        </section>
      ) : null}
    </>
  );
}
