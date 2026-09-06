import { requireMembership } from "../../../../lib/workspace-access";
import { getTasksAiDb } from "../../../../lib/db/client";
import { flowDashboard, portfolio } from "../../../../lib/analytics/service";
import type { RequestContext } from "../../../../lib/context";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analytics" };

export default async function AnalyticsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await requireMembership(slug);
  const ctx: RequestContext = {
    db: getTasksAiDb(),
    workspaceId: m.workspaceId,
    workspaceSlug: slug,
    actor: { membershipId: m.membershipId, platformUserId: m.platformUserId, role: m.role },
    correlationId: "page",
  };
  const [flow, port] = await Promise.all([flowDashboard(ctx), portfolio(ctx)]);

  return (
    <section className="ta-tw">
      <header className="ta-tw__head"><h1>Analytics</h1></header>
      <p className="ta-muted">{flow.note}</p>

      <div className="ta-metrics">
        <Metric label="Cycle time p50" value={`${flow.cycleTime.p50}d`} hint={`${flow.cycleTime.count} completed`} />
        <Metric label="Throughput" value={`${flow.throughput.perDay}/day`} hint={`${flow.throughput.completed} in window`} />
        <Metric label="Open (aging)" value={String(flow.aging.open)} hint={`${flow.aging.buckets["30d+"]} over 30d`} />
        <Metric label="Predictability CV" value={String(flow.predictability.coefficientOfVariation)} hint="lower = steadier" />
      </div>

      <h3>Portfolio</h3>
      <table className="ta-table">
        <thead><tr><th>Project</th><th>Open</th><th>Overdue</th><th>Health</th><th>Forecast p80</th></tr></thead>
        <tbody>
          {port.projects.map((p) => (
            <tr key={p.project.id}>
              <td>{p.project.key} · {p.project.name}</td>
              <td>{p.open}</td>
              <td>{p.overdue}</td>
              <td><span className="ta-badge" data-h={p.health}>{p.health}</span></td>
              <td>{p.forecast.reliable ? new Date(p.forecast.p80).toLocaleDateString() : "n/a (short history)"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {port.goals.length > 0 && (
        <>
          <h3>Goals</h3>
          <ul className="ta-list">
            {port.goals.map((g) => (
              <li key={g.goal.id}>
                <span className="ta-list__title">{g.goal.title}</span>
                <span className="ta-list__due">
                  {g.progress == null ? "no key results" : `${Math.round(g.progress * 100)}%`} · {g.projectCount} project(s)
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="ta-muted">
        Every number is reproducible from versioned semantics
        (<code>{flow.cycleTime.defVersion}</code>). This view reports on <em>work</em>, never on individuals —
        no rankings, no productivity scores.
      </p>
    </section>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="ta-metric">
      <span className="ta-metric__label">{label}</span>
      <span className="ta-metric__value">{value}</span>
      <span className="ta-metric__hint">{hint}</span>
    </div>
  );
}
