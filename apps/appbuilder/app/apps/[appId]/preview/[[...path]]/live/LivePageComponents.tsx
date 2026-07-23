"use client";

import { useState } from "react";
import type { ApplicationSpecificationType, ComponentConfigType, EntityType, PageType } from "@asafarim/appbuilder-schema";
import { LiveDataTable } from "./LiveDataTable";
import { LiveForm } from "./LiveForm";
import { LiveDetailView } from "./LiveDetailView";
import { LiveStatWidget } from "./LiveStatWidget";
import { LiveChartWidget } from "./LiveChartWidget";
import { LiveSettingsPanel } from "./LiveSettingsPanel";
import { LiveKanban } from "./LiveKanban";
import { LiveCalendar } from "./LiveCalendar";
import { hasLivePermission } from "./liveAuth";

function variantOf(component: ComponentConfigType): string {
  const configured = typeof component.config?.variant === "string" ? component.config.variant : undefined;
  if (configured) return configured;
  switch (component.kind) {
    case "dataTable":
      return "table";
    case "form":
      return "form";
    case "detailView":
      return "detail";
    default:
      return "default";
  }
}

function str(config: Record<string, unknown>, key: string): string | undefined {
  const value = config[key];
  return typeof value === "string" ? value : undefined;
}

function strArray(config: Record<string, unknown>, key: string): string[] | undefined {
  const value = config[key];
  return Array.isArray(value) && value.every((v) => typeof v === "string") ? (value as string[]) : undefined;
}

function findEntity(spec: ApplicationSpecificationType, entityId: string | undefined): EntityType | undefined {
  return entityId ? spec.entities.find((e) => e.id === entityId && !e.archived) : undefined;
}

interface EntityWorkspaceProps {
  appId: string;
  entityId: string;
  entity: EntityType;
  spec: ApplicationSpecificationType;
  roleIds: string[];
  simulateRoleId: string | undefined;
  table?: ComponentConfigType;
  form?: ComponentConfigType;
  detail?: ComponentConfigType;
}

/** One entity's table + (optional) create form + (optional) master-detail view, sharing selection/refresh state — the live counterpart to a page that groups a dataTable/form/detailView around the same entity (see taskManagement.ts's tasks page). */
function EntityWorkspace({ appId, entityId, entity, spec, roleIds, simulateRoleId, table, form: formIfPermitted, detail }: EntityWorkspaceProps) {
  // A role without "create" on this entity never sees the create form at
  // all — not just disabled, absent — so there's no control that always
  // 403s. The server independently re-enforces this on every POST
  // regardless (see records.ts#createRecord); this is a UX convenience on
  // top of that, not the authorization boundary itself.
  const form = hasLivePermission(spec, roleIds, entityId, "create") ? formIfPermitted : undefined;
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [showCreateForm, setShowCreateForm] = useState(!detail && !!form);
  const bump = () => setRefreshToken((t) => t + 1);

  return (
    <div className="ab-live-workspace">
      {table ? (
        <LiveDataTable
          appId={appId}
          entityId={entityId}
          entity={entity}
          spec={spec}
          roleIds={roleIds}
          simulateRoleId={simulateRoleId}
          fieldIds={strArray(table.config, "fieldIds")}
          selectedRecordId={detail ? selectedRecordId : undefined}
          onSelectRecord={detail ? setSelectedRecordId : undefined}
          refreshToken={refreshToken}
          onMutated={bump}
        />
      ) : null}

      {form ? (
        <div className="ab-live-workspace__form">
          {detail ? (
            <button type="button" className="ab-live-table__sort" onClick={() => setShowCreateForm((v) => !v)}>
              {showCreateForm ? "Cancel" : `+ New ${entity.name}`}
            </button>
          ) : null}
          {showCreateForm || !detail ? (
            <LiveForm
              appId={appId}
              entityId={entityId}
              entity={entity}
              spec={spec}
              componentId={form.id}
              fieldIds={strArray(form.config, "fieldIds")}
              submitLabel={str(form.config, "submitLabel")}
              simulateRoleId={simulateRoleId}
              onCreated={() => {
                bump();
                if (detail) setShowCreateForm(false);
              }}
            />
          ) : null}
        </div>
      ) : null}

      {detail ? (
        <LiveDetailView
          appId={appId}
          entityId={entityId}
          entity={entity}
          spec={spec}
          roleIds={roleIds}
          recordId={selectedRecordId}
          simulateRoleId={simulateRoleId}
          fieldIds={strArray(detail.config, "fieldIds")}
          refreshToken={refreshToken}
          onMutated={bump}
        />
      ) : null}
    </div>
  );
}

function StandaloneComponent({ appId, spec, simulateRoleId, component, refreshToken }: { appId: string; spec: ApplicationSpecificationType; simulateRoleId: string | undefined; component: ComponentConfigType; refreshToken: number }) {
  const entity = findEntity(spec, component.entityId);
  const config = component.config as Record<string, unknown>;
  const variant = variantOf(component);

  if (component.kind === "dataTable" && variant === "kanban" && entity) {
    const groupByFieldId = str(config, "groupByFieldId");
    if (!groupByFieldId) return <p className="ab-hint">Board isn&apos;t configured yet.</p>;
    return <LiveKanban appId={appId} entityId={entity.id} entity={entity} groupByFieldId={groupByFieldId} cardTitleFieldId={str(config, "cardTitleFieldId")} simulateRoleId={simulateRoleId} refreshToken={refreshToken} />;
  }
  if (component.kind === "dataTable" && variant === "calendar" && entity) {
    const dateFieldId = str(config, "dateFieldId");
    if (!dateFieldId) return <p className="ab-hint">Schedule isn&apos;t configured yet.</p>;
    return <LiveCalendar appId={appId} entityId={entity.id} entity={entity} dateFieldId={dateFieldId} titleFieldId={str(config, "titleFieldId")} simulateRoleId={simulateRoleId} refreshToken={refreshToken} />;
  }
  if (component.kind === "statWidget" && entity) {
    return <LiveStatWidget appId={appId} entity={entity} label={str(config, "label")} filter={str(config, "filter")} simulateRoleId={simulateRoleId} />;
  }
  if (component.kind === "chartWidget" && entity) {
    const groupBy = str(config, "groupBy");
    if (!groupBy) return <p className="ab-hint">Chart isn&apos;t configured yet.</p>;
    return <LiveChartWidget appId={appId} entity={entity} groupByFieldId={groupBy} simulateRoleId={simulateRoleId} />;
  }
  if (component.kind === "form" && variant === "settingsPanel") {
    const sections = Array.isArray(config.sections) ? (config.sections as Array<{ title: string; fields: Array<{ label: string; value?: string }> }>) : [];
    return <LiveSettingsPanel sections={sections} />;
  }
  if (!entity && component.entityId) {
    return <p className="ab-hint">This component references a component/entity that isn&apos;t available.</p>;
  }
  return <p className="ab-hint">This component isn&apos;t interactive in live preview yet.</p>;
}

export interface LivePageComponentsProps {
  appId: string;
  page: PageType;
  spec: ApplicationSpecificationType;
  roleIds: string[];
  simulateRoleId: string | undefined;
  dashboardWidgets: ComponentConfigType[];
}

/** Live, interactive equivalent of M06's per-page component rendering — groups a dataTable/form/detailView bound to the same entity into one workspace (shared selection + refresh state), and dispatches every other kind to its own live renderer. */
export function LivePageComponents({ appId, page, spec, roleIds, simulateRoleId, dashboardWidgets }: LivePageComponentsProps) {
  const [refreshToken] = useState(0);
  const renderables = [...dashboardWidgets, ...page.components].sort((a, b) => a.order - b.order);

  const grouped = new Map<string, { table?: ComponentConfigType; form?: ComponentConfigType; detail?: ComponentConfigType; order: number }>();
  const standalone: ComponentConfigType[] = [];

  for (const component of renderables) {
    const variant = variantOf(component);
    const groupable = component.entityId && ((component.kind === "dataTable" && variant === "table") || (component.kind === "form" && variant === "form") || (component.kind === "detailView" && variant === "detail"));
    if (!groupable) {
      standalone.push(component);
      continue;
    }
    const key = component.entityId!;
    const entry = grouped.get(key) ?? { order: component.order };
    if (component.kind === "dataTable") entry.table = component;
    if (component.kind === "form") entry.form = component;
    if (component.kind === "detailView") entry.detail = component;
    entry.order = Math.min(entry.order, component.order);
    grouped.set(key, entry);
  }

  const items: Array<{ order: number; key: string; render: () => React.ReactNode }> = [];

  for (const [entityId, group] of grouped) {
    const entity = findEntity(spec, entityId);
    if (!entity) continue;
    items.push({
      order: group.order,
      key: entityId,
      render: () => <EntityWorkspace appId={appId} entityId={entityId} entity={entity} spec={spec} roleIds={roleIds} simulateRoleId={simulateRoleId} table={group.table} form={group.form} detail={group.detail} />,
    });
  }
  for (const component of standalone) {
    items.push({
      order: component.order,
      key: component.id,
      render: () => <StandaloneComponent appId={appId} spec={spec} simulateRoleId={simulateRoleId} component={component} refreshToken={refreshToken} />,
    });
  }
  items.sort((a, b) => a.order - b.order);

  if (items.length === 0) {
    return <p className="ab-hint">This page has no content configured yet.</p>;
  }

  return (
    <div className="ab-page-components" data-ab-page-id={page.id}>
      {items.map((item) => (
        <div className="ab-component" key={item.key}>
          {item.render()}
        </div>
      ))}
    </div>
  );
}
