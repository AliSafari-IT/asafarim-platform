import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ROLES, getPlatformApp, hasPermission, requireRole } from "@asafarim/auth";
import {
  Badge,
  EmptyState,
  PageHeader,
  Panel,
  getPlatformLinks,
} from "@asafarim/ui";
import {
  SETTING_GROUPS,
  SETTING_SCOPES,
  getEffectiveSettings,
  type EffectiveSetting,
  type SettingScope,
} from "../../../lib/settings";
import { SettingField } from "./_components/SettingField";

export const metadata: Metadata = { title: "Settings" };

const GROUP_TITLES: Record<string, string> = {
  presentation: "presentation",
  operations: "operations",
  features: "feature flags",
};

function scopeLabel(scope: SettingScope): string {
  if (scope === "platform") return "platform-wide";
  return getPlatformApp(scope)?.name ?? scope;
}

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const session = await requireRole([ROLES.ADMIN]);
  if (!(await hasPermission(session, "settings.view"))) {
    redirect("/denied");
  }
  const canEdit = await hasPermission(session, "settings.edit");

  const params = await searchParams;
  const requested = (params.scope ?? "").trim();
  const scope = SETTING_SCOPES.includes(requested as SettingScope)
    ? (requested as SettingScope)
    : null;

  let settings: EffectiveSetting[] | null;
  try {
    settings = await getEffectiveSettings();
  } catch {
    settings = null;
  }

  const links = getPlatformLinks();
  const visible = settings
    ? scope
      ? settings.filter((setting) => setting.definition.scope === scope)
      : settings
    : [];
  const overriddenCount = settings?.filter((setting) => setting.overridden).length ?? 0;

  return (
    <>
      <PageHeader
        kicker="Configuration"
        kickerIndex="CFG"
        title="Settings"
        description="Bounded platform configuration. Every key is typed, validated against its catalog definition, and audited — secrets and authorization rules are never managed here."
      />

      {settings === null ? (
        <EmptyState
          glyph="[db]"
          title="Database unreachable"
          description="Platform settings could not be loaded. Check the database connection and reload."
        />
      ) : (
        <>
          <div className="ui-filterbar">
            <span className="ui-filterbar__label u-mono">scope</span>
            <span className="ui-chips">
              <a
                href="/settings"
                className={`ui-btn ui-btn--sm ${scope ? "ui-btn--ghost" : "ui-btn--console"}`}
              >
                all
              </a>
              {SETTING_SCOPES.map((option) => (
                <a
                  key={option}
                  href={`/settings?scope=${option}`}
                  className={`ui-btn ui-btn--sm ${
                    scope === option ? "ui-btn--console" : "ui-btn--ghost"
                  }`}
                >
                  {scopeLabel(option)}
                </a>
              ))}
            </span>
            <span className="ui-filterbar__trailing u-mono">
              {settings.length} keys · {overriddenCount} overridden ·{" "}
              {canEdit ? "settings.edit" : "read-only"}
            </span>
          </div>

          <div className="ui-grid ui-grid--wide">
            {SETTING_GROUPS.map((group) => {
              const rows = visible.filter((setting) => setting.definition.group === group);
              if (rows.length === 0) return null;
              return (
                <Panel key={group} title={`${GROUP_TITLES[group]} · ${rows.length}`}>
                  {rows.map((setting) => (
                    <SettingField
                      key={setting.definition.key}
                      settingKey={setting.definition.key}
                      label={setting.definition.label}
                      description={setting.definition.description}
                      type={setting.definition.type}
                      maxLength={setting.definition.maxLength}
                      min={setting.definition.min}
                      max={setting.definition.max}
                      unit={setting.definition.unit}
                      options={setting.definition.options}
                      maxItems={setting.definition.maxItems}
                      highImpact={setting.definition.highImpact}
                      value={setting.value}
                      defaultValue={setting.definition.defaultValue}
                      overridden={setting.overridden}
                      updatedAt={setting.updatedAt?.toISOString() ?? null}
                      updatedByEmail={setting.updatedByEmail}
                      disabled={!canEdit}
                    />
                  ))}
                </Panel>
              );
            })}

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
        </>
      )}
    </>
  );
}
