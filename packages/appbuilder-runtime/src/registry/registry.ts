import type { ComponentConfigType } from "@asafarim/appbuilder-schema";
import {
  ActivityTimelineConfigSchema,
  ButtonActionConfigSchema,
  CalendarConfigSchema,
  ChartWidgetConfigSchema,
  DataTableConfigSchema,
  DetailViewConfigSchema,
  EmptyStateConfigSchema,
  FileFieldConfigSchema,
  FiltersConfigSchema,
  FormConfigSchema,
  KanbanConfigSchema,
  SettingsPanelConfigSchema,
  StatWidgetConfigSchema,
} from "./configSchemas";
import { CalendarRenderer, DataTableRenderer, KanbanRenderer } from "./components/dataDisplay";
import { ActivityTimelineRenderer, DetailViewRenderer, FileFieldRenderer } from "./components/detail";
import { FiltersRenderer, FormRenderer, SettingsPanelRenderer } from "./components/forms";
import { StandaloneEmptyStateRenderer } from "./components/states";
import { ButtonActionRenderer, ChartWidgetRenderer, StatWidgetRenderer } from "./components/widgets";
import type { AnyRegistryEntry, RegistryEntry } from "./types";

/**
 * The approved registry: every entry the metadata-driven renderer is
 * permitted to invoke. Keyed by `registryKey(kind, variant)` — see below.
 * `COMPONENT_KINDS` (`@asafarim/appbuilder-schema`) is a frozen validation
 * allowlist; several logical primitives here deliberately share one schema
 * `kind` via `config.variant` (see registry/types.ts's `RegistryEntry`
 * docstring) so extending the *rendered* catalog never requires a
 * schema-version bump.
 */
const REGISTRY_ENTRIES: AnyRegistryEntry[] = [
  {
    typeId: "dataTable",
    displayName: "Data table",
    category: "data",
    version: "0.1.0",
    schemaKind: "dataTable",
    variant: "table",
    configSchema: DataTableConfigSchema,
    dataBinding: "entityList",
    supportedActions: ["createRecord", "navigate"],
    responsiveNotes: "Horizontally scrolls within a bounded, keyboard-focusable region below 640px; never clips columns off-screen.",
    emptyStateDescription: "No entity bound, or the entity has no visible fields: renders a labelled empty state, not a blank table.",
    loadingStateDescription: "Not applicable in M06 — demo/preview rows render synchronously; a real data engine (M09) will need a loading state here.",
    errorStateDescription: "A configured field id that doesn't exist on the bound entity is dropped from the columns and reported as a render warning, not a page-level failure.",
    a11yNotes: "Real <table>/<caption>/<th scope='col'>; a visually-hidden caption states this is preview data.",
    render: DataTableRenderer as RegistryEntry["render"],
  },
  {
    typeId: "kanbanBoard",
    displayName: "Kanban board",
    category: "data",
    version: "0.1.0",
    schemaKind: "dataTable",
    variant: "kanban",
    configSchema: KanbanConfigSchema,
    dataBinding: "entityList",
    supportedActions: ["updateRecord", "navigate"],
    responsiveNotes: "Columns scroll horizontally as a group below 900px; each column keeps a readable minimum width.",
    emptyStateDescription: "No entity bound: labelled empty state instead of an empty board.",
    loadingStateDescription: "Not applicable in M06 — see Data table.",
    errorStateDescription: "A groupByFieldId that isn't a select field on the bound entity renders an inline diagnostic instead of a broken board.",
    a11yNotes: "Each column is a <section role='group'> with its own heading; cards are a plain list, not drag-and-drop (no pointer-only interaction in M06).",
    render: KanbanRenderer as RegistryEntry["render"],
  },
  {
    typeId: "calendarView",
    displayName: "Calendar / schedule view",
    category: "data",
    version: "0.1.0",
    schemaKind: "dataTable",
    variant: "calendar",
    configSchema: CalendarConfigSchema,
    dataBinding: "entityList",
    supportedActions: ["navigate"],
    responsiveNotes: "Agenda list layout — reflows to a single column at any width instead of a fixed month grid, so it never overflows on narrow viewports.",
    emptyStateDescription: "No entity bound: labelled empty state instead of an empty schedule.",
    loadingStateDescription: "Not applicable in M06 — see Data table.",
    errorStateDescription: "A dateFieldId that isn't a date/datetime field on the bound entity renders an inline diagnostic.",
    a11yNotes: "Each day is a <section> with its own <h4> heading, so screen-reader users can navigate by heading.",
    render: CalendarRenderer as RegistryEntry["render"],
  },
  {
    typeId: "form",
    displayName: "Form",
    category: "input",
    version: "0.1.0",
    schemaKind: "form",
    variant: "form",
    configSchema: FormConfigSchema,
    dataBinding: "singleEntity",
    supportedActions: ["createRecord", "updateRecord"],
    responsiveNotes: "Single-column stacked fields at every width — no fixed-width layout that could overflow on 390px.",
    emptyStateDescription: "No entity bound, or no visible fields: labelled empty state instead of an empty form.",
    loadingStateDescription: "Not applicable in M06 — fields render synchronously, all disabled (preview-only).",
    errorStateDescription: "Not applicable — form fields are generated from already-validated entity field definitions.",
    a11yNotes: "Every control has an associated <label> and a hint via aria-describedby explaining it's preview-only.",
    render: FormRenderer as RegistryEntry["render"],
  },
  {
    typeId: "filters",
    displayName: "Filters / search",
    category: "input",
    version: "0.1.0",
    schemaKind: "form",
    variant: "filters",
    configSchema: FiltersConfigSchema,
    dataBinding: "singleEntity",
    supportedActions: [],
    responsiveNotes: "Filter controls wrap onto multiple rows rather than overflowing horizontally.",
    emptyStateDescription: "No filterable fields configured: renders nothing rather than an empty bar.",
    loadingStateDescription: "Not applicable in M06.",
    errorStateDescription: "A filterable field id that doesn't exist on the bound entity is dropped and reported as a render warning.",
    a11yNotes: "The filter bar is a <form role='search'> with labelled controls.",
    render: FiltersRenderer as RegistryEntry["render"],
  },
  {
    typeId: "settingsPanel",
    displayName: "Settings panel",
    category: "input",
    version: "0.1.0",
    schemaKind: "form",
    variant: "settingsPanel",
    configSchema: SettingsPanelConfigSchema,
    dataBinding: "none",
    supportedActions: [],
    responsiveNotes: "Sections stack full-width at every viewport size.",
    emptyStateDescription: "No sections configured: labelled empty state.",
    loadingStateDescription: "Not applicable — settings values are read-only preview content in M06.",
    errorStateDescription: "Not applicable — settings content is plain label/value pairs, no external binding to fail.",
    a11yNotes: "Each section is a <section> with its own heading; values are read-only <dl> pairs, not disabled inputs.",
    render: SettingsPanelRenderer as RegistryEntry["render"],
  },
  {
    typeId: "detailView",
    displayName: "Record detail",
    category: "detail",
    version: "0.1.0",
    schemaKind: "detailView",
    variant: "detail",
    configSchema: DetailViewConfigSchema,
    dataBinding: "singleEntity",
    supportedActions: ["updateRecord", "archiveRecord"],
    responsiveNotes: "A single-column definition list at every width.",
    emptyStateDescription: "No entity bound, or no visible fields: labelled empty state.",
    loadingStateDescription: "Not applicable in M06 — see Data table.",
    errorStateDescription: "Not applicable — fields are generated from already-validated entity field definitions.",
    a11yNotes: "Rendered as a real <dl>/<dt>/<dd> definition list.",
    render: DetailViewRenderer as RegistryEntry["render"],
  },
  {
    typeId: "activityTimeline",
    displayName: "Activity timeline",
    category: "detail",
    version: "0.1.0",
    schemaKind: "detailView",
    variant: "activityTimeline",
    configSchema: ActivityTimelineConfigSchema,
    dataBinding: "entityList",
    supportedActions: [],
    responsiveNotes: "A single-column vertical list at every width.",
    emptyStateDescription: "No items configured and no entity bound: labelled empty state instead of an empty list.",
    loadingStateDescription: "Not applicable in M06 — items are synchronous demo/preview content.",
    errorStateDescription: "Not applicable.",
    a11yNotes: "Rendered as an ordered list (<ol>) via @asafarim/ui's Timeline.",
    render: ActivityTimelineRenderer as RegistryEntry["render"],
  },
  {
    typeId: "fileField",
    displayName: "File / image field placeholder",
    category: "detail",
    version: "0.1.0",
    schemaKind: "detailView",
    variant: "fileField",
    configSchema: FileFieldConfigSchema,
    dataBinding: "singleEntity",
    supportedActions: [],
    responsiveNotes: "Fixed-aspect placeholder that never overflows its container.",
    emptyStateDescription: "Always renders its placeholder state in M06 — file/image upload and storage ship with M09.",
    loadingStateDescription: "Not applicable.",
    errorStateDescription: "Not applicable.",
    a11yNotes: "Placeholder glyph is aria-hidden; the visible label carries the meaning.",
    render: FileFieldRenderer as RegistryEntry["render"],
  },
  {
    typeId: "emptyState",
    displayName: "Empty state",
    category: "feedback",
    version: "0.1.0",
    schemaKind: "detailView",
    variant: "emptyState",
    configSchema: EmptyStateConfigSchema,
    dataBinding: "none",
    supportedActions: [],
    responsiveNotes: "Centered, single-column at every width.",
    emptyStateDescription: "This entry IS the empty state — used standalone, e.g. for a not-yet-configured page.",
    loadingStateDescription: "Not applicable.",
    errorStateDescription: "Not applicable.",
    a11yNotes: "A heading plus description, no interactive controls to trap focus.",
    render: StandaloneEmptyStateRenderer as RegistryEntry["render"],
  },
  {
    typeId: "statWidget",
    displayName: "Dashboard metric card",
    category: "visualization",
    version: "0.1.0",
    schemaKind: "statWidget",
    variant: "default",
    configSchema: StatWidgetConfigSchema,
    dataBinding: "singleEntity",
    supportedActions: [],
    responsiveNotes: "Reflows into a single column below 640px as part of the dashboard grid.",
    emptyStateDescription: "No entity bound: labelled empty state instead of a blank card.",
    loadingStateDescription: "Not applicable in M06 — value is deterministic preview data.",
    errorStateDescription: "Not applicable.",
    a11yNotes: "Value and label are plain text content, not conveyed by color alone.",
    render: StatWidgetRenderer as RegistryEntry["render"],
  },
  {
    typeId: "chartWidget",
    displayName: "Chart (accessible bar chart)",
    category: "visualization",
    version: "0.1.0",
    schemaKind: "chartWidget",
    variant: "default",
    configSchema: ChartWidgetConfigSchema,
    dataBinding: "entityList",
    supportedActions: [],
    responsiveNotes: "Bars scale to container width; labels wrap rather than truncate silently.",
    emptyStateDescription: "No groupBy select field configured/found: labelled empty state instead of an empty chart.",
    loadingStateDescription: "Not applicable in M06 — series values are deterministic preview data.",
    errorStateDescription: "A groupBy that isn't a select field on the bound entity is reported as a render warning and falls back to the empty state.",
    a11yNotes: "role='img' with a full text summary in aria-label, plus a visually-hidden data table carrying the same values for assistive tech.",
    render: ChartWidgetRenderer as RegistryEntry["render"],
  },
  {
    typeId: "buttonAction",
    displayName: "Action button",
    category: "input",
    version: "0.1.0",
    schemaKind: "buttonAction",
    variant: "default",
    configSchema: ButtonActionConfigSchema,
    dataBinding: "none",
    supportedActions: ["createRecord", "updateRecord", "archiveRecord", "navigate", "runWorkflow"],
    responsiveNotes: "A single button, full-width on narrow viewports via its container, never clipped.",
    emptyStateDescription: "Not applicable — always renders the button.",
    loadingStateDescription: "Not applicable in M06 — disabled until M09 wires real actions.",
    errorStateDescription: "An unknown actionId falls back to a generic label rather than failing the page.",
    a11yNotes: "A real, disabled <button> with a visible hint explaining why — never a non-interactive element styled to look like one.",
    render: ButtonActionRenderer as RegistryEntry["render"],
  },
];

function registryKey(kind: string, variant: string): string {
  return `${kind}.${variant}`;
}

const REGISTRY_BY_KEY = new Map<string, AnyRegistryEntry>(
  REGISTRY_ENTRIES.map((entry) => [registryKey(entry.schemaKind, entry.variant), entry]),
);

export function listRegistryEntries(): AnyRegistryEntry[] {
  return [...REGISTRY_ENTRIES];
}

export function getRegistryEntryByTypeId(typeId: string): AnyRegistryEntry | undefined {
  return REGISTRY_ENTRIES.find((entry) => entry.typeId === typeId);
}

/**
 * Resolves a page component's schema `kind` (+ its `config.variant`, which
 * this function alone gives meaning to) against the registry. Returns
 * `undefined` for anything unregistered — the caller (render/renderPage.tsx)
 * must fail closed on `undefined`, never fall back to a default renderer.
 */
export function resolveComponentEntry(component: ComponentConfigType): AnyRegistryEntry | undefined {
  const variant = typeof component.config?.variant === "string" ? component.config.variant : defaultVariantFor(component.kind);
  return REGISTRY_BY_KEY.get(registryKey(component.kind, variant));
}

function defaultVariantFor(kind: string): string {
  switch (kind) {
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
