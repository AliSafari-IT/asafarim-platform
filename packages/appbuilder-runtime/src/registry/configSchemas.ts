import { z } from "zod";
import { StableId } from "@asafarim/appbuilder-schema";
import { RENDER_LIMITS } from "./limits";

/**
 * One strict Zod schema per registry entry. `.strict()` everywhere —
 * an unrecognized config key is a validation failure, never silently
 * ignored, per M06's "reject unknown configuration keys" requirement.
 * The underlying `@asafarim/appbuilder-schema` `ComponentConfigValue` is
 * already a content-safety-scanned `Record<string, unknown>`; these
 * schemas are the second, component-specific gate on top of it.
 */

export const DataTableConfigSchema = z
  .object({
    variant: z.literal("table").optional(),
    fieldIds: z.array(StableId).max(RENDER_LIMITS.MAX_TABLE_COLUMNS).optional(),
    pageSize: z.number().int().min(1).max(RENDER_LIMITS.MAX_TABLE_ROWS).optional(),
  })
  .strict();
export type DataTableConfig = z.infer<typeof DataTableConfigSchema>;

export const KanbanConfigSchema = z
  .object({
    variant: z.literal("kanban"),
    groupByFieldId: StableId,
    cardTitleFieldId: StableId.optional(),
  })
  .strict();
export type KanbanConfig = z.infer<typeof KanbanConfigSchema>;

export const CalendarConfigSchema = z
  .object({
    variant: z.literal("calendar"),
    dateFieldId: StableId,
    titleFieldId: StableId.optional(),
  })
  .strict();
export type CalendarConfig = z.infer<typeof CalendarConfigSchema>;

export const FormConfigSchema = z
  .object({
    variant: z.literal("form").optional(),
    fieldIds: z.array(StableId).max(RENDER_LIMITS.MAX_FORM_FIELDS).optional(),
    submitLabel: z.string().max(60).optional(),
  })
  .strict();
export type FormConfig = z.infer<typeof FormConfigSchema>;

export const FiltersConfigSchema = z
  .object({
    variant: z.literal("filters"),
    filterableFieldIds: z.array(StableId).min(1).max(20),
    searchable: z.boolean().optional(),
  })
  .strict();
export type FiltersConfig = z.infer<typeof FiltersConfigSchema>;

export const SettingsPanelConfigSchema = z
  .object({
    variant: z.literal("settingsPanel"),
    sections: z
      .array(
        z
          .object({
            title: z.string().min(1).max(200),
            fields: z
              .array(
                z
                  .object({
                    label: z.string().min(1).max(200),
                    value: z.string().max(500).optional(),
                  })
                  .strict(),
              )
              .max(20),
          })
          .strict(),
      )
      .max(10)
      .optional(),
  })
  .strict();
export type SettingsPanelConfig = z.infer<typeof SettingsPanelConfigSchema>;

export const DetailViewConfigSchema = z
  .object({
    variant: z.literal("detail").optional(),
    fieldIds: z.array(StableId).max(RENDER_LIMITS.MAX_FORM_FIELDS).optional(),
  })
  .strict();
export type DetailViewConfig = z.infer<typeof DetailViewConfigSchema>;

export const ActivityTimelineConfigSchema = z
  .object({
    variant: z.literal("activityTimeline"),
    items: z
      .array(
        z
          .object({
            time: z.string().min(1).max(100),
            title: z.string().min(1).max(300),
            meta: z.string().max(300).optional(),
          })
          .strict(),
      )
      .max(RENDER_LIMITS.MAX_TIMELINE_ITEMS)
      .optional(),
  })
  .strict();
export type ActivityTimelineConfig = z.infer<typeof ActivityTimelineConfigSchema>;

export const FileFieldConfigSchema = z
  .object({
    variant: z.literal("fileField"),
    fieldId: StableId.optional(),
    label: z.string().max(200).optional(),
  })
  .strict();
export type FileFieldConfig = z.infer<typeof FileFieldConfigSchema>;

export const EmptyStateConfigSchema = z
  .object({
    variant: z.literal("emptyState"),
    title: z.string().min(1).max(200),
    description: z.string().max(500).optional(),
  })
  .strict();
export type EmptyStateConfig = z.infer<typeof EmptyStateConfigSchema>;

export const StatWidgetConfigSchema = z
  .object({
    metric: z.enum(["count", "sum", "average"]).optional(),
    filter: z.string().max(100).optional(),
    label: z.string().max(200).optional(),
  })
  .strict();
export type StatWidgetConfig = z.infer<typeof StatWidgetConfigSchema>;

export const ChartWidgetConfigSchema = z
  .object({
    chartType: z.enum(["bar", "line", "pie"]).optional(),
    groupBy: StableId.optional(),
  })
  .strict();
export type ChartWidgetConfig = z.infer<typeof ChartWidgetConfigSchema>;

export const ButtonActionConfigSchema = z
  .object({
    label: z.string().max(100).optional(),
    actionId: StableId.optional(),
  })
  .strict();
export type ButtonActionConfig = z.infer<typeof ButtonActionConfigSchema>;
