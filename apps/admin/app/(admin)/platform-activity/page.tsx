import type { Metadata } from "next";
import { PLATFORM_APPS, ROLES, requireRole } from "@asafarim/auth";
import { getPlatformActivityApps, listPlatformActivity, type PlatformActivityEntry } from "@asafarim/activity";
import { EmptyState, FilterBar, PageHeader, Panel, Timeline } from "@asafarim/ui";
import { writeAuditEvent } from "../../../lib/audit";

export const metadata: Metadata = { title: "Platform activity" };

const PAGE_SIZE = 25;

function formatDateTime(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 16);
}

function appLabel(appKey: string): string {
  return PLATFORM_APPS.find((a) => a.key === appKey)?.name ?? appKey;
}

export default async function PlatformActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireRole([ROLES.SUPERADMIN]);
  const params = await searchParams;
  const appFilter = params.app ?? "";
  const cursor = params.cursor ?? null;

  const supportedApps = getPlatformActivityApps();

  const { entries, nextCursor } = await listPlatformActivity({
    limit: PAGE_SIZE,
    cursor,
    app: appFilter || undefined,
  }).catch(() => ({ entries: [] as PlatformActivityEntry[], nextCursor: null }));

  // Every view of the cross-user content feed is itself audited — "the
  // watcher is watched", same principle as the per-user User 360 explorer.
  await writeAuditEvent({
    userId: session.user.id,
    action: "platform.activity.viewed",
    entity: "PlatformActivityView",
    entityId: null,
    changes: { app: appFilter || null, cursor },
  });

  const basePath = "/platform-activity";
  const nextHref = nextCursor
    ? `${basePath}?${new URLSearchParams({ ...(appFilter ? { app: appFilter } : {}), cursor: nextCursor }).toString()}`
    : null;

  return (
    <>
      <PageHeader
        kicker="Access control"
        kickerIndex="ACT"
        title="Platform activity"
        description="Every user's generated content across apps — timelines, Vionto videos, and more — newest first. Superadmin only."
      />

      <Panel title="cross-user content feed · superadmin only">
        {supportedApps.length === 0 ? (
          <EmptyState
            glyph="[ · ]"
            title="No apps support this view yet"
            description="Adapters need to implement listAll for their content to appear here."
          />
        ) : (
          <>
            <FilterBar
              action={basePath}
              fields={[
                {
                  kind: "select",
                  name: "app",
                  label: "app",
                  value: appFilter,
                  options: [
                    { label: "all apps", value: "" },
                    ...supportedApps.map((app) => ({ label: appLabel(app), value: app })),
                  ],
                },
              ]}
              hasFilters={Boolean(appFilter)}
              clearHref={basePath}
            />

            <div style={{ marginTop: "var(--space-4)" }}>
              {entries.length === 0 ? (
                <EmptyState
                  glyph="[ · ]"
                  title={cursor ? "No more activity" : "No activity yet"}
                  description={
                    cursor
                      ? "You've reached the end of this feed."
                      : "Nothing has been generated in the covered apps yet."
                  }
                />
              ) : (
                <Timeline
                  items={entries.map((entry) => ({
                    time: formatDateTime(entry.createdAt),
                    title: `${appLabel(entry.app)} · ${entry.type} · ${entry.title}`,
                    href: entry.href ?? undefined,
                    meta: [entry.status, `by ${entry.owner.name ?? entry.owner.email ?? entry.owner.userId}`]
                      .filter(Boolean)
                      .join(" · "),
                  }))}
                />
              )}
            </div>

            {nextHref ? (
              <p style={{ marginTop: "var(--space-4)" }}>
                <a href={nextHref} className="ui-btn ui-btn--ghost ui-btn--sm">
                  load more
                </a>
              </p>
            ) : null}
          </>
        )}
      </Panel>
    </>
  );
}
