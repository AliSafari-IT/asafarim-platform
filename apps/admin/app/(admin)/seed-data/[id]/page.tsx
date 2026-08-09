import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@asafarim/db";
import { ROLES, hasPermission, requireRole } from "@asafarim/auth";
import { Badge, EmptyState, PageHeader, Panel } from "@asafarim/ui";
import { getProvider, isSeedEnvironment } from "@asafarim/seed-manager";

export const metadata: Metadata = { title: "Seed operation" };

/**
 * One operation's detail: what was asked for, what the plan said, what
 * happened, and the sanitized event log. Everything rendered here was
 * redacted on write, so there is no further filtering to remember at this
 * layer — but equally, nothing here should ever be a raw provider error.
 */
export default async function SeedOperationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ env?: string }>;
}) {
  const session = await requireRole([ROLES.ADMIN]);
  if (!(await hasPermission(session, "seeds.view"))) redirect("/denied");

  const { id } = await params;
  const { env } = await searchParams;
  const backHref = `/seed-data?env=${isSeedEnvironment(env) ? env : "development"}`;

  const operation = await prisma.seedOperation.findUnique({
    where: { id },
    select: {
      id: true,
      providerId: true,
      appId: true,
      environment: true,
      operation: true,
      dryRun: true,
      status: true,
      stage: true,
      progress: true,
      planChecksum: true,
      definitionVersion: true,
      definitionChecksum: true,
      planSummary: true,
      resultSummary: true,
      errorCode: true,
      errorMessage: true,
      queuedAt: true,
      startedAt: true,
      mutationStartedAt: true,
      completedAt: true,
      bulkGroupId: true,
      retryOfOperationId: true,
      requestedBy: { select: { email: true, name: true } },
      events: {
        orderBy: { createdAt: "asc" },
        select: { id: true, level: true, stage: true, message: true, createdAt: true },
      },
    },
  });

  if (!operation) notFound();

  const provider = getProvider(operation.providerId);

  return (
    <>
      <PageHeader
        kicker="Data operations"
        title={`${operation.operation}${operation.dryRun ? " (dry run)" : ""} — ${provider?.displayName ?? operation.providerId}`}
        description={`Operation ${operation.id} in ${operation.environment}.`}
        actions={<Link href={backHref}>← Back to Seed Data</Link>}
      />

      <Panel title="Summary">
        <dl className="seed-provider__facts">
          <div>
            <dt>Status</dt>
            <dd>
              <Badge tone={operation.status === "succeeded" ? "success" : operation.status === "failed" ? "danger" : "info"}>
                {operation.status}
              </Badge>
            </dd>
          </div>
          <div>
            <dt>Stage</dt>
            <dd>{operation.stage ?? "—"}</dd>
          </div>
          <div>
            <dt>Progress</dt>
            <dd>{operation.progress}%</dd>
          </div>
          <div>
            <dt>Actor</dt>
            <dd>{operation.requestedBy?.email ?? "—"}</dd>
          </div>
          <div>
            <dt>Queued</dt>
            <dd>{operation.queuedAt.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Started</dt>
            <dd>{operation.startedAt?.toLocaleString() ?? "—"}</dd>
          </div>
          <div>
            <dt>First mutation</dt>
            <dd>{operation.mutationStartedAt?.toLocaleString() ?? "none"}</dd>
          </div>
          <div>
            <dt>Completed</dt>
            <dd>{operation.completedAt?.toLocaleString() ?? "—"}</dd>
          </div>
          <div>
            <dt>Definition</dt>
            <dd>
              {operation.definitionVersion ? `v${operation.definitionVersion}` : "—"}
              {operation.definitionChecksum ? ` · ${operation.definitionChecksum}` : ""}
            </dd>
          </div>
          <div>
            <dt>Plan checksum</dt>
            <dd>{operation.planChecksum ?? "—"}</dd>
          </div>
          <div>
            <dt>Bulk group</dt>
            <dd>{operation.bulkGroupId ?? "—"}</dd>
          </div>
          <div>
            <dt>Retry of</dt>
            <dd>
              {operation.retryOfOperationId ? (
                <Link href={`/seed-data/${operation.retryOfOperationId}?env=${operation.environment}`}>
                  {operation.retryOfOperationId}
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
        </dl>

        {operation.errorMessage ? (
          <p role="alert">
            <Badge tone="danger">× {operation.errorCode}</Badge> {operation.errorMessage}
          </p>
        ) : null}
      </Panel>

      {operation.planSummary ? (
        <Panel title="Plan">
          <pre className="seed-json">{JSON.stringify(operation.planSummary, null, 2)}</pre>
        </Panel>
      ) : null}

      {operation.resultSummary ? (
        <Panel title="Result">
          <pre className="seed-json">{JSON.stringify(operation.resultSummary, null, 2)}</pre>
        </Panel>
      ) : null}

      <Panel title="Log">
        {operation.events.length === 0 ? (
          <EmptyState
            title="No log entries"
            description="This operation completed without emitting structured events."
          />
        ) : (
          <table className="seed-table">
            <caption className="seed-table__caption">Sanitized operation log</caption>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Level</th>
                <th scope="col">Stage</th>
                <th scope="col">Message</th>
              </tr>
            </thead>
            <tbody>
              {operation.events.map((event) => (
                <tr key={event.id}>
                  <td>{event.createdAt.toLocaleTimeString()}</td>
                  <td>{event.level}</td>
                  <td>{event.stage}</td>
                  <td>{event.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="Related audit events">
        <p>
          Every seed request also writes to the platform audit log.{" "}
          <Link href={`/audit-logs?entity=SeedProvider`}>View seed audit events →</Link>
        </p>
      </Panel>
    </>
  );
}
