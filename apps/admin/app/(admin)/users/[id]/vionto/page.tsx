import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@asafarim/db";
import { ROLES, requireRole } from "@asafarim/auth";
import { formatBytes, formatDeviceContext, formatDuration } from "@asafarim/activity";
import {
  Badge,
  DataTable,
  EmptyState,
  FilterBar,
  PageHeader,
  Panel,
  Pagination,
  type BadgeTone,
  type ColumnDef,
} from "@asafarim/ui";
import { writeAuditEvent } from "../../../../../lib/audit";
import {
  PAGE_SIZE,
  VIONTO_ENTRY_TYPES,
  VIONTO_STATE_FIELD,
  buildVionteWhere,
  hasVionteFilters,
  parseVionteFilters,
  vionteHref,
  type VionteEntryType,
} from "./query";

export const metadata: Metadata = { title: "Vionto activity" };

const TYPE_LABELS: Record<VionteEntryType, string> = {
  project: "Projects",
  video_version: "Video versions",
  render_job: "Render jobs",
  export: "Exports",
  album: "Albums",
};

/** A normalized row shape every type maps into, so one DataTable/columns set covers all five tabs. */
interface Row {
  id: string;
  title: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  projectId: string;
  device: unknown;
  extra: Record<string, string | null>;
}

function viontoUrl(): string {
  return process.env.NEXT_PUBLIC_VIONTO_URL ?? "http://localhost:3004";
}

function projectHref(base: string, projectId: string): string {
  return `${base}/create?projectId=${projectId}`;
}

function formatDateTime(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 16);
}

function statusTone(status: string): BadgeTone {
  if (["failed", "cancelled"].includes(status)) return "danger";
  if (["queued", "draft"].includes(status)) return "neutral";
  if (["completed", "exported", "published_exported", "active"].includes(status)) return "success";
  return "info";
}

/**
 * Fetches one page of one Vionto entry type with real skip/take pagination
 * — unlike the merged User 360 timeline (../page.tsx), which loads every row
 * unconditionally via `loadUserActivity`. This is the "complete, paginated"
 * Vionto history the generic timeline was never meant to be (issue #349).
 */
async function getVionteRows(
  userId: string,
  filters: ReturnType<typeof parseVionteFilters>
): Promise<{ rows: Row[]; total: number; states: string[] }> {
  const where = buildVionteWhere(filters, userId);
  const skip = (filters.page - 1) * PAGE_SIZE;
  const stateField = VIONTO_STATE_FIELD[filters.type];

  const distinctStates = stateField
    ? (
        await (prisma as any)[toModelName(filters.type)].findMany({
          where: { userId },
          distinct: [stateField],
          select: { [stateField]: true },
        })
      ).map((r: Record<string, string>) => r[stateField])
    : [];

  switch (filters.type) {
    case "project": {
      const [rows, total] = await Promise.all([
        prisma.viontoProject.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: PAGE_SIZE,
          select: { id: true, title: true, status: true, createdAt: true, updatedAt: true },
        }),
        prisma.viontoProject.count({ where }),
      ]);
      return {
        total,
        states: distinctStates,
        rows: rows.map((p) => ({
          id: p.id,
          title: p.title,
          status: p.status,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          projectId: p.id,
          device: null,
          extra: {},
        })),
      };
    }
    case "video_version": {
      const [rows, total] = await Promise.all([
        prisma.viontoVideoVersion.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: PAGE_SIZE,
          select: {
            id: true,
            projectId: true,
            name: true,
            mode: true,
            visualStyle: true,
            resolution: true,
            aspectRatio: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.viontoVideoVersion.count({ where }),
      ]);
      return {
        total,
        states: distinctStates,
        rows: rows.map((v) => ({
          id: v.id,
          title: v.name,
          status: v.mode,
          createdAt: v.createdAt,
          updatedAt: v.updatedAt,
          projectId: v.projectId,
          device: null,
          extra: { visualStyle: v.visualStyle, resolution: v.resolution, aspectRatio: v.aspectRatio },
        })),
      };
    }
    case "render_job": {
      const [rows, total] = await Promise.all([
        prisma.viontoRenderJob.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: PAGE_SIZE,
          select: {
            id: true,
            projectId: true,
            state: true,
            progressPercent: true,
            errorSummary: true,
            retryCount: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.viontoRenderJob.count({ where }),
      ]);
      const jobIds = rows.map((j) => j.id);
      const deviceEvents =
        jobIds.length > 0
          ? await prisma.viontoAuditEvent.findMany({
              where: { entity: "ViontoRenderJob", action: "RENDER_STARTED", entityId: { in: jobIds } },
              select: { entityId: true, metadata: true },
            })
          : [];
      const deviceByJobId = new Map(
        deviceEvents.map((e) => [e.entityId, (e.metadata as { device?: unknown } | null)?.device ?? null])
      );
      return {
        total,
        states: distinctStates,
        rows: rows.map((j) => ({
          id: j.id,
          title: `Render job (${j.progressPercent}%)`,
          status: j.state,
          createdAt: j.createdAt,
          updatedAt: j.updatedAt,
          projectId: j.projectId,
          device: deviceByJobId.get(j.id) ?? null,
          extra: {
            retryCount: String(j.retryCount),
            errorSummary: j.errorSummary,
          },
        })),
      };
    }
    case "export": {
      const [rows, total] = await Promise.all([
        prisma.viontoExport.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: PAGE_SIZE,
          select: {
            id: true,
            projectId: true,
            filename: true,
            format: true,
            resolution: true,
            durationSeconds: true,
            fileSizeBytes: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.viontoExport.count({ where }),
      ]);
      return {
        total,
        states: [],
        rows: rows.map((e) => ({
          id: e.id,
          title: e.filename ?? `Export (${e.format})`,
          status: "exported",
          createdAt: e.createdAt,
          updatedAt: e.updatedAt,
          projectId: e.projectId,
          device: null,
          extra: {
            resolution: e.resolution,
            duration: formatDuration(e.durationSeconds),
            size: formatBytes(e.fileSizeBytes),
          },
        })),
      };
    }
    case "album": {
      const [rows, total] = await Promise.all([
        prisma.viontoAlbum.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: PAGE_SIZE,
          select: { id: true, projectId: true, name: true, lifecycleStage: true, createdAt: true, updatedAt: true },
        }),
        prisma.viontoAlbum.count({ where }),
      ]);
      return {
        total,
        states: distinctStates,
        rows: rows.map((a) => ({
          id: a.id,
          title: a.name,
          status: a.lifecycleStage,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
          projectId: a.projectId,
          device: null,
          extra: {},
        })),
      };
    }
  }
}

/** Prisma delegate name for each entry type, used only for the distinct-states lookup. */
function toModelName(type: VionteEntryType): string {
  return (
    {
      project: "viontoProject",
      video_version: "viontoVideoVersion",
      render_job: "viontoRenderJob",
      export: "viontoExport",
      album: "viontoAlbum",
    } satisfies Record<VionteEntryType, string>
  )[type];
}

export default async function UserVionteActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  // Stricter than the base user page (ADMIN + users.view): cross-user
  // video/device detail is superadmin-only per issue #349.
  const session = await requireRole([ROLES.SUPERADMIN]);

  const { id } = await params;
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true },
  });
  if (!target) notFound();

  const filters = parseVionteFilters(await searchParams);
  const { rows, total, states } = await getVionteRows(target.id, filters);

  // Same "the watcher is watched" principle as the merged timeline and
  // Platform Activity — this is a distinct, more granular view of the same
  // category of cross-user data, so it gets its own audit action.
  await writeAuditEvent({
    userId: session.user.id,
    action: "user.vionto_history.viewed",
    entity: "UserActivityView",
    entityId: target.id,
    changes: { type: filters.type, state: filters.state || null, from: filters.from || null, to: filters.to || null, page: filters.page },
  });

  const base = viontoUrl();
  const hasFilters = hasVionteFilters(filters);

  const columns: ColumnDef<Row>[] = [
    {
      id: "title",
      header: "Title",
      render: (row) => (
        <a href={projectHref(base, row.projectId)} target="_blank" rel="noopener noreferrer" className="ui-table__link">
          {row.title} <span aria-hidden="true">↗</span>
        </a>
      ),
    },
    {
      id: "status",
      header: "Status",
      render: (row) => <Badge tone={statusTone(row.status)}>{row.status}</Badge>,
    },
    {
      id: "created",
      header: "Created (UTC)",
      mono: true,
      nowrap: true,
      render: (row) => formatDateTime(row.createdAt),
    },
    ...(filters.type === "render_job"
      ? [
          {
            id: "device",
            header: "Device",
            render: (row: Row) => formatDeviceContext(row.device) ?? <span className="u-muted">not recorded</span>,
          } satisfies ColumnDef<Row>,
          {
            id: "retries",
            header: "Retries",
            mono: true,
            align: "right" as const,
            render: (row: Row) => row.extra.retryCount ?? "0",
          } satisfies ColumnDef<Row>,
          {
            id: "error",
            header: "Error",
            render: (row: Row) => row.extra.errorSummary ?? <span className="u-muted">—</span>,
          } satisfies ColumnDef<Row>,
        ]
      : []),
    ...(filters.type === "export"
      ? [
          {
            id: "resolution",
            header: "Resolution",
            mono: true,
            render: (row: Row) => row.extra.resolution ?? "—",
          } satisfies ColumnDef<Row>,
          {
            id: "duration",
            header: "Duration",
            mono: true,
            render: (row: Row) => row.extra.duration ?? "—",
          } satisfies ColumnDef<Row>,
          {
            id: "size",
            header: "Size",
            mono: true,
            align: "right" as const,
            render: (row: Row) => row.extra.size ?? "—",
          } satisfies ColumnDef<Row>,
        ]
      : []),
    ...(filters.type === "video_version"
      ? [
          {
            id: "visual-style",
            header: "Visual style",
            render: (row: Row) => row.extra.visualStyle ?? "—",
          } satisfies ColumnDef<Row>,
          {
            id: "resolution",
            header: "Resolution",
            mono: true,
            render: (row: Row) => row.extra.resolution ?? "—",
          } satisfies ColumnDef<Row>,
        ]
      : []),
  ];

  const stateField = VIONTO_STATE_FIELD[filters.type];

  return (
    <>
      <PageHeader
        kicker="Access control"
        kickerIndex="VNT"
        title={`Vionto activity · ${target.name ?? target.email}`}
        description="Complete, paginated Vionto history for this user — projects, video versions, render jobs, exports, and albums, queried separately from the merged cross-app timeline."
      />

      <p style={{ marginBottom: "var(--space-4)" }}>
        <a href={`/users/${target.id}`} className="ui-btn ui-btn--ghost ui-btn--sm">
          ← back to user detail
        </a>
      </p>

      <Panel title="vionto · superadmin only">
        <FilterBar
          action={`/users/${target.id}/vionto`}
          fields={[
            { kind: "hidden", name: "type", value: filters.type },
            ...(stateField
              ? [
                  {
                    kind: "select" as const,
                    name: "state",
                    label: "state",
                    value: filters.state,
                    options: [
                      { label: "all", value: "" },
                      ...states.map((s) => ({ label: s, value: s })),
                    ],
                  },
                ]
              : []),
            { kind: "date" as const, name: "from", label: "from", value: filters.from },
            { kind: "date" as const, name: "to", label: "to", value: filters.to },
          ]}
          chips={{
            label: "type",
            options: VIONTO_ENTRY_TYPES.map((type) => ({
              label: TYPE_LABELS[type],
              href: vionteHref(target.id, filters, { type, page: 1 }),
              active: filters.type === type,
            })),
          }}
          hasFilters={hasFilters}
          clearHref={vionteHref(target.id, { ...filters, state: "", from: "", to: "" })}
        />

        <div style={{ marginTop: "var(--space-4)" }}>
          <DataTable
            columns={columns}
            rows={rows}
            getRowKey={(row) => row.id}
            caption={`${TYPE_LABELS[filters.type]} for ${target.email}`}
            empty={
              <EmptyState
                glyph="[ · ]"
                title={hasFilters ? "No matching rows" : `No ${TYPE_LABELS[filters.type].toLowerCase()} yet`}
                description={hasFilters ? "Try clearing a filter." : "Nothing recorded in this category yet."}
              />
            }
          />
        </div>

        {rows.length > 0 ? (
          <Pagination
            page={filters.page}
            pageSize={PAGE_SIZE}
            total={total}
            noun={TYPE_LABELS[filters.type].toLowerCase().replace(/s$/, "")}
            hrefFor={(page) => vionteHref(target.id, filters, { page })}
          />
        ) : null}
      </Panel>
    </>
  );
}
