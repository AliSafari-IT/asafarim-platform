import type { EntityType } from "@asafarim/appbuilder-schema";
import { Button, Metric } from "@asafarim/ui";
import { generateDemoRows } from "../../render/demoData";
import { RENDER_LIMITS } from "../limits";
import type { ComponentRenderProps } from "../types";
import type { ButtonActionConfig, ChartWidgetConfig, StatWidgetConfig } from "../configSchemas";
import { ComponentEmptyState, DemoDataNotice } from "./states";

/** Stable, non-random per-entity metric so a preview render is reproducible across requests and in snapshot tests. */
function deterministicMetric(entity: EntityType, metric: "count" | "sum" | "average"): number {
  const seed = [...entity.id].reduce((total, char) => total + char.charCodeAt(0), 0);
  const base = 5 + (seed % 46);
  if (metric === "sum") return base * 10;
  if (metric === "average") return Math.round((base * 10) / 3);
  return base;
}

export function StatWidgetRenderer({ config, entity }: ComponentRenderProps<StatWidgetConfig>) {
  if (!entity) {
    return <ComponentEmptyState title="No metric yet" description="This card isn't bound to an entity yet." />;
  }

  const metric = config.metric ?? "count";
  const value = deterministicMetric(entity, metric);
  const label = config.label ?? `${entity.name} — ${metric}`;

  return (
    <DemoDataNotice>
      <Metric label={label} value={value} hint={config.filter ? `Filter: ${config.filter} (preview data)` : "Preview data"} />
    </DemoDataNotice>
  );
}

/**
 * All chart types currently render as an accessible horizontal bar chart —
 * visually distinct line/pie renderings are deferred, not silently claimed.
 * Every chart carries a visually-hidden data table so screen-reader users
 * get the same information sighted users get from the bars.
 */
export function ChartWidgetRenderer({ config, entity, reportWarning }: ComponentRenderProps<ChartWidgetConfig>) {
  if (!entity) {
    return <ComponentEmptyState title="No chart yet" description="This chart isn't bound to an entity yet." />;
  }

  const groupField = entity.fields.find((field) => field.id === config.groupBy && !field.archived);
  if (config.groupBy && (!groupField || groupField.type !== "select")) {
    reportWarning({
      code: "invalid_binding",
      message: `Chart's groupBy "${config.groupBy}" is not a select field on entity "${entity.id}"`,
    });
  }

  if (!groupField || groupField.type !== "select") {
    return <ComponentEmptyState title="No chart data yet" description="Configure a select field to group by." />;
  }

  const sampleSize = Math.min(6, RENDER_LIMITS.MAX_CHART_SERIES_POINTS);
  const rows = generateDemoRows(entity, sampleSize);
  const counts = groupField.options.map((option, index) => ({
    label: option.label,
    value: rows.filter((row) => row[groupField.machineName] === option.value).length || index + 1,
  }));
  const max = Math.max(...counts.map((entry) => entry.value), 1);
  const summary = counts.map((entry) => `${entry.label}: ${entry.value}`).join(", ");

  return (
    <DemoDataNotice>
      <div className="ab-chart" role="img" aria-label={`${entity.name} by ${groupField.name} — ${summary}`}>
        <ul className="ab-chart__bars" aria-hidden="true">
          {counts.map((entry) => (
            <li key={entry.label}>
              <span className="ab-chart__bar" style={{ width: `${(entry.value / max) * 100}%` }} />
              <label>{entry.label}</label>
            </li>
          ))}
        </ul>
        <table className="ab-visually-hidden">
          <caption>
            {entity.name} by {groupField.name}
          </caption>
          <thead>
            <tr>
              <th scope="col">{groupField.name}</th>
              <th scope="col">Count</th>
            </tr>
          </thead>
          <tbody>
            {counts.map((entry) => (
              <tr key={entry.label}>
                <td>{entry.label}</td>
                <td>{entry.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DemoDataNotice>
  );
}

export function ButtonActionRenderer({ config, spec }: ComponentRenderProps<ButtonActionConfig>) {
  const action = spec.actions.find((candidate) => candidate.id === config.actionId && !candidate.archived);
  const label = config.label ?? action?.name ?? "Run action";

  return (
    <div className="ab-button-action">
      <Button type="button" disabled variant="secondary">
        {label}
      </Button>
      <p className="ab-hint">Preview only — actions run once M09 ships.</p>
    </div>
  );
}
