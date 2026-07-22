"use client";

import { useState } from "react";
import type { SelectionContext } from "./types";

/** Minimal shape this panel needs from the full ApplicationSpecificationType — read-only, never mutated here. */
interface SpecPayload {
  entities?: Array<{ id: string; name: string; fields?: Array<{ id: string; name: string; type: string }>; archived?: boolean }>;
  relations?: Array<{ id: string; name: string; fromEntityId: string; toEntityId: string; archived?: boolean }>;
  roles?: Array<{ id: string; name: string; archived?: boolean }>;
  permissions?: Array<{ id: string; roleId: string; entityId: string; verb: string; effect: string }>;
  pages?: Array<{ id: string; name: string; path: string; components?: Array<{ id: string; kind: string }>; archived?: boolean }>;
  navigation?: Array<{ id: string; label: string; targetPageId: string }>;
  workflows?: Array<{ id: string; name: string; archived?: boolean }>;
  branding?: { theme?: string };
}

interface Section {
  id: string;
  label: string;
}

const SECTIONS: Section[] = [
  { id: "pages", label: "Pages & navigation" },
  { id: "entities", label: "Entities & fields" },
  { id: "relations", label: "Relations" },
  { id: "roles", label: "Roles & permissions" },
  { id: "workflows", label: "Workflows" },
  { id: "branding", label: "Branding & settings" },
];

export interface StructurePanelProps {
  spec: SpecPayload | null;
  versionNumber: number;
  appId: string;
  onSelectPage: (pageId: string, label: string) => void;
  onSelectComponent: (pageId: string, componentId: string, componentKind: string, label: string) => void;
  onOpenHistory: () => void;
}

/**
 * Read-only navigation over the persisted specification. Selecting an item
 * only populates bounded AI context (see workspace/types.ts's
 * SelectionContext) and, where applicable, asks the preview pane to focus
 * the corresponding page/component — it NEVER mutates the specification
 * directly. Data CRUD, generated-record browsing, etc. are explicitly out
 * of scope here (M09).
 */
export function StructurePanel({ spec, versionNumber, appId, onSelectPage, onSelectComponent, onOpenHistory }: StructurePanelProps) {
  const [openSection, setOpenSection] = useState<string>("pages");

  if (!spec) {
    return <p className="ui-hint">No specification yet — structure appears once an initial version has been generated.</p>;
  }

  return (
    <nav aria-label="Application structure">
      {SECTIONS.map((section) => (
        <div key={section.id} style={{ marginBottom: "var(--space-3)" }}>
          <button
            type="button"
            aria-expanded={openSection === section.id}
            onClick={() => setOpenSection(openSection === section.id ? "" : section.id)}
            className="ui-btn ui-btn--ghost ui-btn--sm"
            style={{ width: "100%", justifyContent: "flex-start", fontWeight: 600 }}
          >
            {section.label}
          </button>
          {openSection === section.id ? (
            <div style={{ paddingLeft: "var(--space-3)", marginTop: "var(--space-2)" }}>
              {section.id === "pages" && renderPages(spec, versionNumber, appId, onSelectPage, onSelectComponent)}
              {section.id === "entities" && renderEntities(spec)}
              {section.id === "relations" && renderRelations(spec)}
              {section.id === "roles" && renderRoles(spec)}
              {section.id === "workflows" && renderWorkflows(spec)}
              {section.id === "branding" && renderBranding(spec)}
            </div>
          ) : null}
        </div>
      ))}
      <button type="button" className="ui-btn ui-btn--secondary ui-btn--sm" onClick={onOpenHistory} style={{ width: "100%" }}>
        Version history
      </button>
    </nav>
  );
}

function renderPages(
  spec: SpecPayload,
  versionNumber: number,
  appId: string,
  onSelectPage: StructurePanelProps["onSelectPage"],
  onSelectComponent: StructurePanelProps["onSelectComponent"],
) {
  const pages = (spec.pages ?? []).filter((p) => !p.archived);
  if (pages.length === 0) return <p className="ui-hint">No pages yet.</p>;
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--space-1)" }}>
      {pages.map((page) => (
        <li key={page.id}>
          <button
            type="button"
            className="ui-btn ui-btn--ghost ui-btn--sm"
            style={{ width: "100%", justifyContent: "flex-start" }}
            onClick={() => onSelectPage(page.id, page.name)}
          >
            {page.name}
          </button>
          {(page.components ?? []).length > 0 ? (
            <ul style={{ listStyle: "none", margin: 0, padding: "0 0 0 var(--space-4)", display: "grid", gap: "var(--space-1)" }}>
              {(page.components ?? []).map((component) => (
                <li key={component.id}>
                  <button
                    type="button"
                    className="ui-btn ui-btn--ghost ui-btn--sm"
                    style={{ width: "100%", justifyContent: "flex-start", fontSize: "var(--text-xs)" }}
                    onClick={() => onSelectComponent(page.id, component.id, component.kind, `${page.name} / ${component.kind}`)}
                  >
                    {component.kind} ({component.id})
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function renderEntities(spec: SpecPayload) {
  const entities = (spec.entities ?? []).filter((e) => !e.archived);
  if (entities.length === 0) return <p className="ui-hint">No entities yet.</p>;
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--space-2)" }}>
      {entities.map((entity) => (
        <li key={entity.id}>
          <strong>{entity.name}</strong>
          <ul style={{ margin: "var(--space-1) 0 0", paddingLeft: "var(--space-4)", fontSize: "var(--text-xs)", color: "var(--muted)" }}>
            {(entity.fields ?? []).map((field) => (
              <li key={field.id}>
                {field.name} <span className="ui-hint">({field.type})</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function renderRelations(spec: SpecPayload) {
  const relations = (spec.relations ?? []).filter((r) => !r.archived);
  if (relations.length === 0) return <p className="ui-hint">No relations yet.</p>;
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: "var(--text-sm)" }}>
      {relations.map((r) => (
        <li key={r.id}>
          {r.name} <span className="ui-hint">({r.fromEntityId} → {r.toEntityId})</span>
        </li>
      ))}
    </ul>
  );
}

function renderRoles(spec: SpecPayload) {
  const roles = (spec.roles ?? []).filter((r) => !r.archived);
  const permissions = spec.permissions ?? [];
  if (roles.length === 0) return <p className="ui-hint">No roles yet.</p>;
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--space-2)" }}>
      {roles.map((role) => (
        <li key={role.id}>
          <strong>{role.name}</strong>
          <ul style={{ margin: "var(--space-1) 0 0", paddingLeft: "var(--space-4)", fontSize: "var(--text-xs)", color: "var(--muted)" }}>
            {permissions
              .filter((p) => p.roleId === role.id)
              .map((p) => (
                <li key={p.id}>
                  {p.entityId}: {p.verb} — {p.effect}
                </li>
              ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function renderWorkflows(spec: SpecPayload) {
  const workflows = (spec.workflows ?? []).filter((w) => !w.archived);
  if (workflows.length === 0) return <p className="ui-hint">No workflows yet.</p>;
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {workflows.map((w) => (
        <li key={w.id}>{w.name}</li>
      ))}
    </ul>
  );
}

function renderBranding(spec: SpecPayload) {
  return <p className="ui-hint">Theme: {spec.branding?.theme ?? "system"}</p>;
}
