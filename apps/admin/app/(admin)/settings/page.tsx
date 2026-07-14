import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ROLES, hasPermission, requireRole } from "@asafarim/auth";
import {
  Badge,
  EmptyState,
  PageHeader,
  Panel,
  getPlatformLinks,
} from "@asafarim/ui";
import { getEffectiveSettings, type EffectiveSetting } from "../../../lib/settings";
import { SettingField } from "./_components/SettingField";

export const metadata: Metadata = { title: "Settings" };

const GROUP_TITLES: Record<string, string> = {
  presentation: "presentation",
  operations: "operations",
  features: "feature flags",
};

export default async function AdminSettingsPage() {
  const session = await requireRole([ROLES.ADMIN]);
  if (!(await hasPermission(session, "settings.view"))) {
    redirect("/denied");
  }
  const canEdit = await hasPermission(session, "settings.edit");

  let settings: EffectiveSetting[] | null;
  try {
    settings = await getEffectiveSettings();
  } catch {
    settings = null;
  }

  const links = getPlatformLinks();

  return (
    <>
      <PageHeader
        kicker="Configuration"
        kickerIndex="CFG"
        title="Settings"
        description="Bounded platform configuration. Every key is typed, validated, and audited — secrets and authorization rules are never managed here."
      />

      {settings === null ? (
        <EmptyState
          glyph="[db]"
          title="Database unreachable"
          description="Platform settings could not be loaded. Check the database connection and reload."
        />
      ) : (
        <div className="ui-grid ui-grid--wide">
          {Object.entries(GROUP_TITLES).map(([group, title]) => (
            <Panel
              key={group}
              title={`${title} · ${canEdit ? "settings.edit" : "read-only"}`}
            >
              {settings
                .filter((setting) => setting.definition.group === group)
                .map((setting) => (
                  <SettingField
                    key={setting.definition.key}
                    settingKey={setting.definition.key}
                    label={setting.definition.label}
                    description={setting.definition.description}
                    type={setting.definition.type}
                    maxLength={setting.definition.maxLength}
                    highImpact={setting.definition.highImpact}
                    value={setting.value}
                    defaultValue={setting.definition.defaultValue}
                    overridden={setting.overridden}
                    disabled={!canEdit}
                  />
                ))}
            </Panel>
          ))}

          <Panel title="environment · read-only">
            <p className="u-muted" style={{ fontSize: "var(--text-xs)" }}>
              Resolved from environment variables at build/start time. These
              cannot be edited here — change the deployment environment instead.
            </p>
            <dl style={{ margin: 0, fontSize: "var(--text-sm)" }}>
              {(
                [
                  ["node env", process.env.NODE_ENV ?? "development"],
                  ["web url", links.web],
                  ["hub url", links.hub],
                  ["showcase url", links.showcase],
                  ["admin url", links.admin],
                ] as const
              ).map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "var(--space-3)",
                    padding: "var(--space-2) 0",
                    borderBottom: "1px solid var(--line)",
                    flexWrap: "wrap",
                  }}
                >
                  <span className="u-mono">{label}</span>
                  <span className="u-mono" style={{ color: "var(--ink)" }}>
                    {value}
                  </span>
                </div>
              ))}
            </dl>
            <div style={{ marginTop: "var(--space-3)" }}>
              <Badge tone="neutral">env-managed</Badge>
            </div>
          </Panel>
        </div>
      )}
    </>
  );
}
