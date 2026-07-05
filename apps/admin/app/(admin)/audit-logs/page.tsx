import type { Metadata } from "next";
import { prisma } from "@asafarim/db";
import { EmptyState, PageHeader, Panel, Timeline } from "@asafarim/ui";

export const metadata: Metadata = { title: "Audit Logs" };

async function getRecentEvents() {
  try {
    return await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { user: { select: { email: true } } },
    });
  } catch {
    return null;
  }
}

export default async function AuditLogsPage() {
  const events = await getRecentEvents();

  return (
    <>
      <PageHeader
        kicker="Event stream"
        kickerIndex="LOG"
        title="Audit Logs"
        description="Administrative and security events, newest first."
      />
      {events && events.length > 0 ? (
        <Panel title={`last ${events.length} events`}>
          <Timeline
            items={events.map((event) => ({
              time: event.createdAt.toISOString().replace("T", " ").slice(0, 19),
              title: `${event.action} · ${event.entity}${event.entityId ? ` #${event.entityId}` : ""}`,
              meta: event.user?.email ?? "system",
            }))}
          />
        </Panel>
      ) : (
        <EmptyState
          glyph="> _"
          title="No events recorded yet"
          description={
            events
              ? "The audit stream is armed — administrative actions will appear here as they happen."
              : "The database is not reachable right now."
          }
        />
      )}
    </>
  );
}
