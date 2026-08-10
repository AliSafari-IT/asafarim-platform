import type { Metadata } from "next";
import { ROLES, requireRole } from "@asafarim/auth";
import {
  Badge,
  DataTable,
  EmptyState,
  PageHeader,
  type BadgeTone,
  type ColumnDef,
} from "@asafarim/ui";
import {
  getTailnetDevices,
  type TailscaleDevice,
} from "../../../lib/server/tailscale";

export const metadata: Metadata = { title: "Devices" };
export const dynamic = "force-dynamic";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return iso.replace("T", " ").slice(0, 16) + " UTC";
}

function onlineBadge(device: TailscaleDevice): { tone: BadgeTone; label: string } {
  if (!device.authorized) return { tone: "warning", label: "unauthorized" };
  if (device.online) return { tone: "success", label: "online" };
  return { tone: "neutral", label: "offline" };
}

const deviceColumns: ColumnDef<TailscaleDevice>[] = [
  {
    id: "device",
    header: "Device",
    render: (device) => (
      <>
        <span className="ui-table__primary">{device.name || device.hostname}</span>
        {device.isExternal ? <span className="ui-table__sub">shared device</span> : null}
      </>
    ),
  },
  {
    id: "status",
    header: "Status",
    render: (device) => {
      const status = onlineBadge(device);
      return (
        <>
          <Badge tone={status.tone}>{status.label}</Badge>
          {device.updateAvailable ? (
            <span className="u-muted" style={{ marginLeft: "var(--space-2)" }}>
              update available
            </span>
          ) : null}
        </>
      );
    },
  },
  {
    id: "addresses",
    header: "Addresses",
    mono: true,
    render: (device) => device.addresses.join(", ") || "—",
  },
  { id: "os", header: "OS", render: (device) => device.os || "—" },
  { id: "user", header: "User", render: (device) => device.user || "—" },
  {
    id: "lastSeen",
    header: "Last seen",
    mono: true,
    nowrap: true,
    render: (device) => formatDate(device.lastSeen),
  },
  {
    id: "expires",
    header: "Key expires",
    mono: true,
    nowrap: true,
    render: (device) =>
      device.keyExpiryDisabled ? "never" : formatDate(device.expires),
  },
];

export default async function DevicesPage() {
  await requireRole([ROLES.ADMIN]);

  const result = await getTailnetDevices();

  return (
    <>
      <PageHeader
        kicker="Network"
        kickerIndex="NET"
        title="Devices"
        description="Machines on the ASafarIM tailnet, read from the Tailscale API. For approvals, key rotation, or removal, use the Tailscale admin console directly."
      />

      {result.state === "not_configured" ? (
        <EmptyState
          glyph="[ts]"
          title="Tailscale isn't connected"
          description="Set TAILSCALE_API_KEY (an API access token or OAuth client secret with devices:core:read scope, from https://login.tailscale.com/admin/settings/keys) and TAILSCALE_TAILNET in apps/admin/.env, then reload."
        />
      ) : result.state === "error" ? (
        <EmptyState
          glyph="[!]"
          title="Could not reach Tailscale"
          description={result.message}
        />
      ) : result.devices.length === 0 ? (
        <EmptyState
          glyph="[ts]"
          title="No devices on this tailnet"
          description="Add a device from the Tailscale admin console to see it here."
        />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))",
            gap: "var(--space-3)",
            marginBottom: "var(--space-5)",
          }}
        >
          <SummaryCard
            label="Devices"
            value={String(result.devices.length)}
            sub="on the tailnet"
          />
          <SummaryCard
            label="Online"
            value={String(result.devices.filter((d) => d.online).length)}
            sub={`within last ${5} min`}
          />
          <SummaryCard
            label="Updates available"
            value={String(result.devices.filter((d) => d.updateAvailable).length)}
            sub="Tailscale client"
          />
        </div>
      )}

      {result.state === "ok" && result.devices.length > 0 ? (
        <DataTable
          columns={deviceColumns}
          rows={result.devices}
          getRowKey={(device) => device.id}
          caption="Tailnet devices"
        />
      ) : null}
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
        padding: "var(--space-4)",
        background: "var(--surface-1)",
      }}
    >
      <p className="u-muted" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
        {label}
      </p>
      <p style={{ margin: "var(--space-1) 0", fontSize: "var(--text-2xl)", fontWeight: 600 }}>
        {value}
      </p>
      <p className="u-muted" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
        {sub}
      </p>
    </div>
  );
}
