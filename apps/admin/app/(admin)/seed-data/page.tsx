import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@asafarim/db";
import { ROLES, hasPermission, requireRole } from "@asafarim/auth";
import {
  Badge,
  EmptyState,
  Metric,
  PageHeader,
  Panel,
  Section,
} from "@asafarim/ui";
import {
  NO_BACKUP_NOTICE,
  SEED_ENVIRONMENTS,
  isProductionSeedingEnabled,
  isSeedEnvironment,
  type SeedEnvironment,
} from "@asafarim/seed-manager";

import {
  healthPresentation,
  loadProviderViews,
  summarize,
  type ProviderView,
} from "../../../lib/seed-cache";
import { ProviderPanel } from "./ProviderPanel";

export const metadata: Metadata = { title: "Seed Data" };

/**
 * Read-only in this release: status, validation and dry-run planning are
 * available; seed / reconcile / remove arrive with the background worker.
 * The note below is rendered on every provider so the gap is explicit rather
 * than looking like a broken button.
 */
const MUTATIONS_NOTE =
  "Dry runs are read-only. Applying a plan runs as a background job and is not enabled yet in this release.";

const HISTORY_PAGE_SIZE = 25;

export default async function SeedDataPage({
  searchParams,
}: {
  searchParams: Promise<{ env?: string; page?: string; provider?: string; status?: string }>;
}) {
  const session = await requireRole([ROLES.ADMIN]);
  // Server-side gate. The nav entry is hidden without this permission too,
  // but hiding a link is not authorization — this redirect is.
  if (!(await hasPermission(session, "seeds.view"))) redirect("/denied");

  const params = await searchParams;
  const environment: SeedEnvironment = isSeedEnvironment(params.env)
    ? params.env
    : "development";

  const [views, history] = await Promise.all([
    loadProviderViews(environment),
    loadHistory(environment, params),
  ]);
  const metrics = summarize(views);
  const productionEnabled = isProductionSeedingEnabled();

  return (
    <>
      <PageHeader
        kicker="Data operations"
        title="Seed Data"
        description="Manage deterministic, code-defined seed data across every app. Only records the seed provably owns are ever touched — user-created data is never seeded over or removed."
      />

      {environment === "production" ? (
        <div role="alert" className="seed-danger">
          <Badge tone="danger">⚠ Production</Badge>
          <p>
            You are viewing the <strong>production</strong> environment.{" "}
            {productionEnabled
              ? "Production seed management is enabled on this server."
              : "Production seed management is disabled. Set SEED_MANAGER_PRODUCTION_ENABLED=true on the server to enable it."}
          </p>
          <p>{NO_BACKUP_NOTICE}</p>
        </div>
      ) : null}

      <Section>
        <div className="seed-metrics">
          <Metric label="Configured providers" value={metrics.configured} hint={`of ${views.length} apps`} />
          <Metric label="Clean" value={metrics.clean} />
          <Metric label="Drift detected" value={metrics.drift} />
          <Metric label="Active operations" value={metrics.active} />
          <Metric label="Failed operations" value={metrics.failed} />
          <Metric
            label="Last validation"
            value={metrics.lastValidationAt ? metrics.lastValidationAt.toLocaleString() : "never"}
          />
        </div>
      </Section>

      <Panel title="Environment">
        <nav aria-label="Environment">
          <ul className="seed-envs">
            {SEED_ENVIRONMENTS.map((env) => (
              <li key={env}>
                <Link
                  href={`/seed-data?env=${env}`}
                  aria-current={env === environment ? "page" : undefined}
                  className={env === environment ? "seed-env seed-env--active" : "seed-env"}
                >
                  {env}
                  {env === "production" ? <span aria-hidden="true"> ⚠</span> : null}
                  {env === "production" ? <span className="sr-only"> (danger)</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Panel>

      <Panel title={`Providers — ${environment}`}>
        <ul className="seed-providers">
          {views.map((view) => (
            <li key={view.provider.id}>
              <ProviderCard view={view} environment={environment} />
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Operation history">
        {history.rows.length === 0 ? (
          <EmptyState
            title="No operations yet"
            description={`Nothing has been run against ${environment}. Validate a provider or take a status reading to populate this log.`}
          />
        ) : (
          <>
            <table className="seed-table">
              <caption className="seed-table__caption">
                Seed operations in {environment}, newest first
              </caption>
              <thead>
                <tr>
                  <th scope="col">Status</th>
                  <th scope="col">Operation</th>
                  <th scope="col">Provider</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Started</th>
                  <th scope="col">Duration</th>
                  <th scope="col">Definition</th>
                  <th scope="col">Detail</th>
                </tr>
              </thead>
              <tbody>
                {history.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Badge tone={statusTone(row.status)}>
                        {statusSymbol(row.status)} {row.status}
                      </Badge>
                    </td>
                    <td>
                      {row.operation}
                      {row.dryRun ? " (dry run)" : ""}
                    </td>
                    <td>{row.providerId}</td>
                    <td>{row.requestedBy?.email ?? "—"}</td>
                    <td>{(row.startedAt ?? row.queuedAt).toLocaleString()}</td>
                    <td>{formatDuration(row)}</td>
                    <td>
                      {row.definitionVersion ? `v${row.definitionVersion}` : "—"}
                      {row.planChecksum ? ` · plan ${row.planChecksum.slice(0, 8)}` : ""}
                    </td>
                    <td>
                      {row.errorMessage ? (
                        <span>
                          [{row.errorCode}] {row.errorMessage}
                        </span>
                      ) : (
                        <Link href={`/seed-data/${row.id}?env=${environment}`}>View</Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <HistoryPager
              environment={environment}
              page={history.page}
              total={history.total}
              params={params}
            />
          </>
        )}
      </Panel>

      <Panel title="Adding a provider">
        <div id="adding-a-provider">
          <p>
            Apps shown as <strong>Not configured</strong> have no seed provider yet. Adding one means
            defining stable seed keys and an ownership manifest, implementing validate / inspect /
            plan / execute, and registering the provider in the allowlist.
          </p>
          <p>
            Full walkthrough: <code>docs/seed-management.md</code> → “Adding a provider”.
          </p>
        </div>
      </Panel>
    </>
  );
}

function ProviderCard({
  view,
  environment,
}: {
  view: ProviderView;
  environment: SeedEnvironment;
}) {
  const { provider } = view;
  const presentation = healthPresentation(view.health);

  return (
    <article className="seed-provider" aria-labelledby={`provider-${provider.id}`}>
      <header className="seed-provider__head">
        <h3 id={`provider-${provider.id}`}>{provider.displayName}</h3>
        <span className="seed-provider__badges">
          <Badge tone={presentation.tone}>
            <span aria-hidden="true">{presentation.symbol} </span>
            {presentation.label}
          </Badge>
          {provider.protected ? <Badge tone="info">Protected foundation</Badge> : null}
          {view.stale ? <Badge tone="warning">⧗ Status stale</Badge> : null}
          {view.activeOperationId ? <Badge tone="info">● Operation active</Badge> : null}
        </span>
      </header>

      <p className="seed-provider__description">{provider.description}</p>

      {view.configurationIssue ? (
        <p role="status" className="seed-provider__config">
          {view.configurationIssue}
        </p>
      ) : null}

      <dl className="seed-provider__facts">
        <div>
          <dt>Database</dt>
          <dd>{provider.databaseKind}</dd>
        </div>
        <div>
          <dt>Environment</dt>
          <dd>{environment}</dd>
        </div>
        <div>
          <dt>Definition</dt>
          <dd>
            v{provider.definitionVersion}
            {view.definitionChecksum ? ` · ${view.definitionChecksum.slice(0, 8)}` : ""}
          </dd>
        </div>
        <div>
          <dt>Seed-owned records</dt>
          <dd>{view.seedOwnedCount ?? "—"}</dd>
        </div>
        <div>
          <dt>Missing</dt>
          <dd>{view.missingCount ?? "—"}</dd>
        </div>
        <div>
          <dt>Drifted</dt>
          <dd>{view.driftedCount ?? "—"}</dd>
        </div>
        <div>
          <dt>Orphaned</dt>
          <dd>{view.orphanedCount ?? "—"}</dd>
        </div>
        <div>
          <dt>Last checked</dt>
          <dd>{view.lastCheckedAt ? view.lastCheckedAt.toLocaleString() : "never"}</dd>
        </div>
        <div>
          <dt>Last successful seed</dt>
          <dd>{view.lastSuccessfulSeedAt ? view.lastSuccessfulSeedAt.toLocaleString() : "never"}</dd>
        </div>
        <div>
          <dt>Last validation</dt>
          <dd>{view.lastValidationAt ? view.lastValidationAt.toLocaleString() : "never"}</dd>
        </div>
        <div>
          <dt>Last operation</dt>
          <dd>{view.lastOperationStatus ?? "—"}</dd>
        </div>
      </dl>

      {provider.availability === "not-configured" ? (
        <p className="seed-provider__note">
          No mutation actions are offered for this app. See “Adding a provider” below.
        </p>
      ) : (
        <ProviderPanel
          providerId={provider.id}
          displayName={provider.displayName}
          environment={environment}
          supports={provider.supports}
          isProtected={provider.protected}
          availability={provider.availability}
          configurationIssue={view.configurationIssue}
          mutationsUnavailableNote={MUTATIONS_NOTE}
        />
      )}

      {provider.externalLink && provider.availability === "configured" ? (
        <p className="seed-provider__link">
          <a href={provider.externalLink.href}>{provider.externalLink.label}</a> —{" "}
          {provider.externalLink.note}
        </p>
      ) : null}
    </article>
  );
}

async function loadHistory(
  environment: SeedEnvironment,
  params: { page?: string; provider?: string; status?: string }
) {
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const where = {
    environment,
    ...(params.provider ? { providerId: params.provider } : {}),
    ...(params.status ? { status: params.status } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.seedOperation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * HISTORY_PAGE_SIZE,
      take: HISTORY_PAGE_SIZE,
      select: {
        id: true,
        providerId: true,
        operation: true,
        dryRun: true,
        status: true,
        queuedAt: true,
        startedAt: true,
        completedAt: true,
        definitionVersion: true,
        planChecksum: true,
        errorCode: true,
        errorMessage: true,
        requestedBy: { select: { email: true } },
      },
    }),
    prisma.seedOperation.count({ where }),
  ]);

  return { rows, total, page };
}

function HistoryPager({
  environment,
  page,
  total,
  params,
}: {
  environment: SeedEnvironment;
  page: number;
  total: number;
  params: { provider?: string; status?: string };
}) {
  const pages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
  if (pages === 1) return null;

  const href = (target: number) => {
    const query = new URLSearchParams({ env: environment, page: String(target) });
    if (params.provider) query.set("provider", params.provider);
    if (params.status) query.set("status", params.status);
    return `/seed-data?${query.toString()}`;
  };

  return (
    <nav aria-label="Operation history pages" className="seed-pager">
      {page > 1 ? <Link href={href(page - 1)}>← Newer</Link> : null}
      <span>
        Page {page} of {pages}
      </span>
      {page < pages ? <Link href={href(page + 1)}>Older →</Link> : null}
    </nav>
  );
}

function statusTone(status: string): "neutral" | "info" | "success" | "warning" | "danger" {
  if (status === "succeeded") return "success";
  if (status === "failed") return "danger";
  if (status === "partially_succeeded") return "warning";
  if (status === "cancelled" || status === "stale") return "neutral";
  return "info";
}

function statusSymbol(status: string): string {
  if (status === "succeeded") return "✓";
  if (status === "failed") return "×";
  if (status === "partially_succeeded") return "≈";
  if (status === "cancelled") return "–";
  return "●";
}

function formatDuration(row: { startedAt: Date | null; completedAt: Date | null }): string {
  if (!row.startedAt || !row.completedAt) return "—";
  const ms = row.completedAt.getTime() - row.startedAt.getTime();
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}
