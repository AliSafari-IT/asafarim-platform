import type { Metadata } from "next";
import { ROLES, requireRole } from "@asafarim/auth";
import { Badge, EmptyState, PageHeader, type BadgeTone } from "@asafarim/ui";
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
        <div className="ui-tablewrap">
          <table className="ui-table">
            <thead>
              <tr>
                <th>Device</th>
                <th>Status</th>
                <th>Addresses</th>
                <th>OS</th>
                <th>User</th>
                <th>Last seen</th>
                <th>Key expires</th>
              </tr>
            </thead>
            <tbody>
              {result.devices.map((device) => {
                const status = onlineBadge(device);
                return (
                  <tr key={device.id}>
                    <td>
                      <span className="ui-table__primary">
                        {device.name || device.hostname}
                      </span>
                      {device.isExternal ? (
                        <span className="ui-table__sub"> shared device</span>
                      ) : null}
                    </td>
                    <td>
                      <Badge tone={status.tone}>{status.label}</Badge>
                      {device.updateAvailable ? (
                        <span className="u-muted" style={{ marginLeft: "var(--space-2)" }}>
                          update available
                        </span>
                      ) : null}
                    </td>
                    <td className="u-mono">{device.addresses.join(", ") || "—"}</td>
                    <td>{device.os || "—"}</td>
                    <td>{device.user || "—"}</td>
                    <td className="u-mono">{formatDate(device.lastSeen)}</td>
                    <td className="u-mono">
                      {device.keyExpiryDisabled ? "never" : formatDate(device.expires)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
