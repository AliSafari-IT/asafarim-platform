import type { Metadata } from "next";
import { ROLES, requireRole } from "@asafarim/auth";
import { Badge, EmptyState, PageHeader, type BadgeTone } from "@asafarim/ui";
import {
  getProviderAccounts,
  totalEstimatedUsd,
  type LiveAccount,
  type ProviderAccount,
} from "../../../lib/server/provider-accounts";

export const metadata: Metadata = { title: "Subscriptions" };
export const dynamic = "force-dynamic";

function usd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return iso.replace("T", " ").slice(0, 16) + " UTC";
}

function liveSummary(live: LiveAccount): {
  tone: BadgeTone;
  label: string;
} {
  switch (live.state) {
    case "ok":
      return { tone: "success", label: live.tier ?? "connected" };
    case "not_configured":
      return { tone: "neutral", label: "no key" };
    case "unsupported":
      return { tone: "neutral", label: "dashboard only" };
    case "error":
      return { tone: "warning", label: "unreachable" };
  }
}

function LiveDetails({ account }: { account: ProviderAccount }) {
  const { live, meta } = account;

  if (live.state === "ok") {
    const pct =
      live.usedChars != null && live.limitChars
        ? Math.min(100, Math.round((live.usedChars / live.limitChars) * 100))
        : null;
    return (
      <ul style={{ margin: 0, paddingLeft: "1rem", fontSize: "var(--text-xs)" }}>
        {live.status ? <li>Status: {live.status}</li> : null}
        {live.usedChars != null && live.limitChars != null ? (
          <li>
            Characters: {live.usedChars.toLocaleString()} /{" "}
            {live.limitChars.toLocaleString()}
            {pct != null ? ` (${pct}% used)` : ""}
          </li>
        ) : null}
        <li>Renews / resets: {formatDate(live.nextResetAt)}</li>
      </ul>
    );
  }

  const note =
    live.state === "error"
      ? live.message
      : live.state === "not_configured"
        ? `Set ${meta.envKey} in apps/admin/.env to read this account.`
        : "This provider does not expose balance over its API — open its dashboard.";

  return (
    <p className="u-muted" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
      {note}
    </p>
  );
}

export default async function SubscriptionsPage() {
  await requireRole([ROLES.ADMIN]);

  let accounts: ProviderAccount[] | null = null;
  try {
    accounts = await getProviderAccounts();
  } catch {
    accounts = null;
  }

  return (
    <>
      <PageHeader
        kicker="AI providers"
        kickerIndex="SUB"
        title="Subscriptions & Usage"
        description="Account status for each AI provider, live subscription data where the provider's API exposes it, and estimated spend computed from your own generation log. Estimates are indicative — the provider dashboard is the source of truth for billing."
      />

      {accounts === null ? (
        <EmptyState
          glyph="[db]"
          title="Could not load providers"
          description="The database or provider APIs could not be reached. Check the connection and reload."
        />
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))",
              gap: "var(--space-3)",
              marginBottom: "var(--space-5)",
            }}
          >
            <SummaryCard
              label="Estimated spend"
              value={usd(totalEstimatedUsd(accounts))}
              sub="all AI clips, all time"
            />
            <SummaryCard
              label="Clips generated"
              value={String(
                accounts.reduce((n, a) => n + a.usage.clips, 0)
              )}
              sub="across providers"
            />
            <SummaryCard
              label="Providers configured"
              value={`${accounts.filter((a) => a.configured).length} / ${accounts.length}`}
              sub="have an API key set"
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(20rem, 1fr))",
              gap: "var(--space-4)",
            }}
          >
            {accounts.map((account) => {
              const summary = liveSummary(account.live);
              return (
                <section
                  key={account.meta.id}
                  style={{
                    border: "1px solid var(--line)",
                    borderRadius: "var(--radius-sm)",
                    padding: "var(--space-4)",
                    background: "var(--surface-1)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      gap: "var(--space-2)",
                    }}
                  >
                    <div>
                      <h3 style={{ margin: 0 }}>{account.meta.label}</h3>
                      <p
                        className="u-muted"
                        style={{ margin: 0, fontSize: "var(--text-xs)" }}
                      >
                        {account.meta.role}
                      </p>
                    </div>
                    <Badge tone={summary.tone}>{summary.label}</Badge>
                  </div>

                  <div style={{ marginTop: "var(--space-3)" }}>
                    <LiveDetails account={account} />
                  </div>

                  <dl
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "var(--space-2) var(--space-3)",
                      margin: "var(--space-3) 0 0",
                      fontSize: "var(--text-xs)",
                    }}
                  >
                    <Stat label="Est. spend" value={usd(account.usage.estimatedUsd)} />
                    <Stat label="Clips" value={String(account.usage.clips)} />
                    <Stat label="Succeeded" value={String(account.usage.succeeded)} />
                    <Stat label="Failed" value={String(account.usage.failed)} />
                    <Stat
                      label="Total seconds"
                      value={account.usage.totalSeconds.toFixed(0)}
                    />
                    <Stat
                      label="Last used"
                      value={
                        account.usage.lastActivity
                          ? formatDate(account.usage.lastActivity)
                          : "—"
                      }
                    />
                  </dl>

                  <a
                    href={account.meta.dashboardUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="ui-btn ui-btn--console ui-btn--sm"
                    style={{ marginTop: "var(--space-3)" }}
                  >
                    Open {account.meta.label} dashboard ↗
                  </a>
                </section>
              );
            })}
          </div>

          <p
            className="u-muted"
            style={{ marginTop: "var(--space-5)", fontSize: "var(--text-xs)" }}
          >
            Only ElevenLabs exposes live subscription data to an API key. For
            fal.ai, OpenAI, Anthropic and Kling, balances and renewal dates live
            on each provider&apos;s dashboard; the figures above are estimated
            from Vionto&apos;s own generation log.
          </p>
        </>
      )}
    </>
  );
}

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--line)",
        borderRadius: "var(--radius-sm)",
        padding: "var(--space-3) var(--space-4)",
        background: "var(--surface-1)",
      }}
    >
      <p className="u-mono u-muted" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
        {label}
      </p>
      <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-xl)", fontWeight: 600 }}>
        {value}
      </p>
      <p className="u-muted" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
        {sub}
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="u-muted" style={{ fontSize: "var(--text-2xs, 0.7rem)" }}>
        {label}
      </dt>
      <dd style={{ margin: 0, fontWeight: 500 }}>{value}</dd>
    </div>
  );
}
