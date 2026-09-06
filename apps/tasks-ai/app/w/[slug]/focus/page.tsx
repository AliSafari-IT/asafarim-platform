import { requireMembership } from "../../../../lib/workspace-access";
import { getTasksAiDb } from "../../../../lib/db/client";
import { dailyBrief, workspaceSignals } from "../../../../lib/intel/service";
import type { RequestContext } from "../../../../lib/context";

export const dynamic = "force-dynamic";
export const metadata = { title: "Focus" };

export default async function FocusPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await requireMembership(slug);
  const ctx: RequestContext = {
    db: getTasksAiDb(),
    workspaceId: m.workspaceId,
    workspaceSlug: slug,
    actor: { membershipId: m.membershipId, platformUserId: m.platformUserId, role: m.role },
    correlationId: "page",
  };
  const [brief, sig] = await Promise.all([dailyBrief(ctx), workspaceSignals(ctx)]);

  return (
    <section className="ta-tw">
      <header className="ta-tw__head">
        <h1>Focus</h1>
      </header>
      <p className="ta-muted">{brief.note}</p>

      <h3>Today&apos;s top {brief.topFocus.length}</h3>
      {brief.topFocus.length === 0 ? (
        <p className="ta-muted">Nothing assigned to you is open.</p>
      ) : (
        <ol className="ta-focus">
          {brief.topFocus.map((item) => (
            <li key={item.task.id}>
              <div className="ta-focus__row">
                <span className="ta-focus__score" title="explainable score">
                  {item.score}
                </span>
                <span className="ta-focus__title">{item.task.title}</span>
              </div>
              <ul className="ta-focus__factors">
                {item.factors
                  .filter((f) => f.points > 0)
                  .sort((a, b) => b.points - a.points)
                  .map((f) => (
                    <li key={f.factor}>
                      <strong>{f.factor}</strong> +{f.points} · {f.because}
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
      <p className="ta-muted ta-focus__limits">{brief.ruleVersions.focus} — deterministic. It does not read task content or judge anyone.</p>

      <h3>Risk &amp; workload signals</h3>
      {sig.signals.length === 0 ? (
        <p className="ta-muted">No signals right now.</p>
      ) : (
        <ul className="ta-signals">
          {sig.signals.map((s, i) => (
            <li key={i} data-sev={s.severity}>
              <p className="ta-signals__title">
                <span className="ta-badge">{s.severity}</span> {s.title}
              </p>
              <p className="ta-signals__meta">
                confidence {(s.confidence * 100).toFixed(0)}% · fresh as of {new Date(s.freshness).toLocaleDateString()} ·{" "}
                {s.ruleVersion}
              </p>
              <p className="ta-signals__lim">Limitations: {s.limitations}</p>
              <p className="ta-signals__alt">Options: {s.alternatives.join(" · ")}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="ta-muted">
        Managers: this feature reports on <em>work</em> — dates, dependencies, counts. It cannot and
        does not produce personality, emotion, or productivity scores.
      </p>
    </section>
  );
}
