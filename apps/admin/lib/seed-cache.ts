import { prisma } from "@asafarim/db";
import {
  listProviders,
  resolveContext,
  type SeedEnvironment,
  type SeedHealth,
  type SeedProvider,
} from "@asafarim/seed-manager";

/**
 * Cached provider state for the Seed Data page.
 *
 * Inspecting three separate databases on every render would make the page
 * slow and would hammer production the moment someone leaves a tab open. So
 * the page renders the last recorded status and says when it was taken;
 * refreshing is an explicit action.
 */

/** Status older than this is shown with a "stale" indicator. */
export const STALE_AFTER_MS = 30 * 60 * 1000;

export interface CachedEntityCounts {
  entity: string;
  seedKey: string;
  present: number;
  missing: number;
  drifted: number;
  orphaned: number;
}

export interface ProviderView {
  provider: SeedProvider;
  /** Why this provider cannot be reached in this environment, if it cannot. */
  configurationIssue: string | null;
  health: SeedHealth;
  stale: boolean;
  lastCheckedAt: Date | null;
  lastSuccessfulSeedAt: Date | null;
  lastValidationAt: Date | null;
  lastOperationStatus: string | null;
  seedOwnedCount: number | null;
  missingCount: number | null;
  driftedCount: number | null;
  orphanedCount: number | null;
  definitionChecksum: string | null;
  entities: CachedEntityCounts[];
  activeOperationId: string | null;
}

interface StatusSummary {
  health?: SeedHealth;
  seedOwnedCount?: number;
  missingCount?: number;
  driftedCount?: number;
  orphanedCount?: number;
  entities?: CachedEntityCounts[];
}

const ACTIVE_STATUSES = [
  "queued",
  "validating",
  "inspecting",
  "planning",
  "awaiting_execution",
  "executing",
  "verifying",
];

/**
 * Build the per-provider view for one environment. A single grouped query
 * per concern keeps this to a small, bounded number of round trips against
 * the platform database — and none against the provider databases.
 */
export async function loadProviderViews(
  environment: SeedEnvironment
): Promise<ProviderView[]> {
  const providers = listProviders();
  const providerIds = providers.map((p) => p.id);

  const [statuses, seeds, validations, latest, active] = await Promise.all([
    latestPerProvider(providerIds, environment, ["status"], ["succeeded"]),
    latestPerProvider(providerIds, environment, ["seed", "reconcile"], ["succeeded", "partially_succeeded"], true),
    latestPerProvider(providerIds, environment, ["validate"], ["succeeded", "failed"]),
    latestPerProvider(providerIds, environment, undefined, undefined),
    prisma.seedOperation.findMany({
      where: { environment, status: { in: ACTIVE_STATUSES } },
      select: { id: true, providerId: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const activeByProvider = new Map(active.map((row) => [row.providerId, row.id]));
  const now = Date.now();

  return providers.map((provider) => {
    const status = statuses.get(provider.id);
    const summary = (status?.resultSummary ?? null) as StatusSummary | null;
    const lastCheckedAt = status?.completedAt ?? null;

    // A provider whose environment variable is unset is a *configuration*
    // problem, not a data problem, and must read differently.
    const context = resolveContext(provider, environment);
    const configurationIssue =
      provider.availability !== "configured"
        ? null
        : context.ok
          ? null
          : context.reason;

    const health: SeedHealth =
      provider.availability !== "configured"
        ? "not-configured"
        : configurationIssue
          ? "unavailable"
          : (summary?.health ?? "unknown");

    return {
      provider,
      configurationIssue,
      health,
      stale: Boolean(lastCheckedAt) && now - lastCheckedAt!.getTime() > STALE_AFTER_MS,
      lastCheckedAt,
      lastSuccessfulSeedAt: seeds.get(provider.id)?.completedAt ?? null,
      lastValidationAt: validations.get(provider.id)?.completedAt ?? null,
      lastOperationStatus: latest.get(provider.id)?.status ?? null,
      seedOwnedCount: summary?.seedOwnedCount ?? null,
      missingCount: summary?.missingCount ?? null,
      driftedCount: summary?.driftedCount ?? null,
      orphanedCount: summary?.orphanedCount ?? null,
      definitionChecksum: status?.definitionChecksum ?? null,
      entities: summary?.entities ?? [],
      activeOperationId: activeByProvider.get(provider.id) ?? null,
    };
  });
}

async function latestPerProvider(
  providerIds: string[],
  environment: SeedEnvironment,
  operations?: string[],
  statuses?: string[],
  excludeDryRuns = false
) {
  const rows = await prisma.seedOperation.findMany({
    where: {
      providerId: { in: providerIds },
      environment,
      ...(operations ? { operation: { in: operations } } : {}),
      ...(statuses ? { status: { in: statuses } } : {}),
      ...(excludeDryRuns ? { dryRun: false } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      providerId: true,
      status: true,
      completedAt: true,
      resultSummary: true,
      definitionChecksum: true,
    },
  });

  // First row wins — the query is already newest-first.
  const byProvider = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!byProvider.has(row.providerId)) byProvider.set(row.providerId, row);
  }
  return byProvider;
}

export interface SummaryMetrics {
  configured: number;
  clean: number;
  drift: number;
  active: number;
  failed: number;
  lastValidationAt: Date | null;
}

export function summarize(views: ProviderView[]): SummaryMetrics {
  const lastValidations = views
    .map((view) => view.lastValidationAt)
    .filter((value): value is Date => value !== null)
    .sort((a, b) => b.getTime() - a.getTime());

  return {
    configured: views.filter((v) => v.provider.availability === "configured").length,
    clean: views.filter((v) => v.health === "clean").length,
    drift: views.filter((v) => v.health === "drifted" || v.health === "orphaned").length,
    active: views.filter((v) => v.activeOperationId !== null).length,
    failed: views.filter((v) => v.lastOperationStatus === "failed").length,
    lastValidationAt: lastValidations[0] ?? null,
  };
}

/** Health → (label, tone, symbol). Never colour alone. */
export function healthPresentation(health: SeedHealth): {
  label: string;
  tone: "neutral" | "info" | "success" | "warning" | "danger";
  symbol: string;
} {
  switch (health) {
    case "clean":
      return { label: "Clean", tone: "success", symbol: "✓" };
    case "missing":
      return { label: "Missing seed data", tone: "warning", symbol: "!" };
    case "drifted":
      return { label: "Drift detected", tone: "warning", symbol: "≠" };
    case "orphaned":
      return { label: "Orphaned rows", tone: "warning", symbol: "≠" };
    case "not-configured":
      return { label: "Not configured", tone: "neutral", symbol: "–" };
    case "unavailable":
      return { label: "Database unavailable", tone: "danger", symbol: "×" };
    case "validation-failed":
      return { label: "Validation failed", tone: "danger", symbol: "×" };
    default:
      return { label: "Not checked yet", tone: "info", symbol: "?" };
  }
}
