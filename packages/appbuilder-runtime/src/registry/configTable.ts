import type { z } from "zod";
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

/**
 * The (typeId, schemaKind, variant, configSchema) shape of every registered
 * component — deliberately split out from registry.ts (which additionally
 * wires each entry to its React renderer and UI-only metadata) so a
 * non-React consumer can depend on just this: today, the AI generation
 * prompts in @asafarim/appbuilder-ai, which need the real config schemas to
 * tell the model what a valid ADD_COMPONENT config looks like, without
 * pulling in this package's .tsx renderer components (which would need a
 * `jsx` compiler option a server-only AI package has no reason to carry).
 *
 * registry.test.ts asserts this list's (typeId, schemaKind, variant) tuples
 * match REGISTRY_ENTRIES exactly, so this can never silently drift from
 * what actually renders.
 */
export interface ConfigTableEntry {
  typeId: string;
  schemaKind: string;
  variant: string;
  configSchema: z.ZodType;
}

export const CONFIG_TABLE: readonly ConfigTableEntry[] = [
  { typeId: "dataTable", schemaKind: "dataTable", variant: "table", configSchema: DataTableConfigSchema },
  { typeId: "kanbanBoard", schemaKind: "dataTable", variant: "kanban", configSchema: KanbanConfigSchema },
  { typeId: "calendarView", schemaKind: "dataTable", variant: "calendar", configSchema: CalendarConfigSchema },
  { typeId: "form", schemaKind: "form", variant: "form", configSchema: FormConfigSchema },
  { typeId: "filters", schemaKind: "form", variant: "filters", configSchema: FiltersConfigSchema },
  { typeId: "settingsPanel", schemaKind: "form", variant: "settingsPanel", configSchema: SettingsPanelConfigSchema },
  { typeId: "detailView", schemaKind: "detailView", variant: "detail", configSchema: DetailViewConfigSchema },
  {
    typeId: "activityTimeline",
    schemaKind: "detailView",
    variant: "activityTimeline",
    configSchema: ActivityTimelineConfigSchema,
  },
  { typeId: "fileField", schemaKind: "detailView", variant: "fileField", configSchema: FileFieldConfigSchema },
  { typeId: "emptyState", schemaKind: "detailView", variant: "emptyState", configSchema: EmptyStateConfigSchema },
  { typeId: "statWidget", schemaKind: "statWidget", variant: "default", configSchema: StatWidgetConfigSchema },
  { typeId: "chartWidget", schemaKind: "chartWidget", variant: "default", configSchema: ChartWidgetConfigSchema },
  { typeId: "buttonAction", schemaKind: "buttonAction", variant: "default", configSchema: ButtonActionConfigSchema },
];
