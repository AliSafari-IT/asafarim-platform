import {
  AlignLeft,
  CalendarDays,
  CalendarRange,
  ChartGantt,
  CircleDot,
  GitBranch,
  ListTree,
  MousePointerClick,
  MoveHorizontal,
  Route,
  type LucideIcon,
} from "lucide-react";
import type { TimelineInput } from "./schemas";

export type TimelineType = TimelineInput["timelineType"];
export type TimelineLayout = TimelineInput["layout"];
export type TimelineThemePreset = "canvas" | "midnight" | "editorial";

/**
 * Every timeline type offers exactly three layouts. The point is curation,
 * not capability: all ten renderers can draw any event list, but a Gantt
 * chart of a storytelling timeline is noise, so each type surfaces the three
 * that actually suit it. Layouts are reused across types — there are ten
 * renderers behind these, not twenty-one.
 */
export const LAYOUTS_BY_TYPE = {
  general: ["vertical", "horizontal", "zigzag"],
  project: ["horizontal", "gantt", "roadmap"],
  historical: ["vertical", "zigzag", "radial"],
  roadmap: ["roadmap", "horizontal", "branch"],
  gantt: ["gantt", "roadmap", "horizontal"],
  calendar: ["calendar", "calendar-board", "vertical"],
  interactive: ["interactive", "branch", "radial"],
} as const satisfies Record<TimelineType, readonly [TimelineLayout, TimelineLayout, TimelineLayout]>;

export interface LayoutOption {
  id: TimelineLayout;
  name: string;
  description: string;
  icon: LucideIcon;
}

const LAYOUT_OPTIONS: Record<TimelineLayout, LayoutOption> = {
  vertical: {
    id: "vertical",
    name: "Vertical",
    description: "A single column, read top to bottom.",
    icon: AlignLeft,
  },
  horizontal: {
    id: "horizontal",
    name: "Horizontal",
    description: "A left-to-right track you scroll along.",
    icon: MoveHorizontal,
  },
  zigzag: {
    id: "zigzag",
    name: "Zigzag",
    description: "Events alternate either side of a spine.",
    icon: ListTree,
  },
  radial: {
    id: "radial",
    name: "Circular",
    description: "Events arranged around a ring — good for cycles.",
    icon: CircleDot,
  },
  roadmap: {
    id: "roadmap",
    name: "Roadmap",
    description: "Grouped into swimlanes by phase or label.",
    icon: Route,
  },
  gantt: {
    id: "gantt",
    name: "Gantt",
    description: "Bars spanning start to end — shows overlap.",
    icon: ChartGantt,
  },
  calendar: {
    id: "calendar",
    name: "Calendar",
    description: "Events grouped into the month they fall in.",
    icon: CalendarDays,
  },
  "calendar-board": {
    id: "calendar-board",
    name: "Calendar board",
    description: "Month columns with agenda and day-grid views.",
    icon: CalendarRange,
  },
  interactive: {
    id: "interactive",
    name: "Interactive",
    description: "Filter by category and expand events in place.",
    icon: MousePointerClick,
  },
  branch: {
    id: "branch",
    name: "Branching",
    description: "Cards branch above and below a connector.",
    icon: GitBranch,
  },
};

/**
 * Per-type display overrides. The renderer is the same, but what the layout
 * *means* changes with the type — a vertical calendar reads as an agenda, so
 * that is what the calendar type calls it.
 */
const LAYOUT_NAME_OVERRIDES: Partial<Record<`${TimelineType}:${TimelineLayout}`, Partial<Omit<LayoutOption, "id" | "icon">>>> = {
  "calendar:vertical": {
    name: "Vertical agenda",
    description: "One column, every event in date order.",
  },
};

export function getLayoutOptions(type: TimelineType): LayoutOption[] {
  return LAYOUTS_BY_TYPE[type].map((id) => {
    const base = LAYOUT_OPTIONS[id];
    const override = LAYOUT_NAME_OVERRIDES[`${type}:${id}`];
    return override ? { ...base, ...override } : base;
  });
}

export function isLayoutValidForType(type: TimelineType, layout: TimelineLayout): boolean {
  return (LAYOUTS_BY_TYPE[type] as readonly TimelineLayout[]).includes(layout);
}

/**
 * Keeps the current layout when it still suits the new type, otherwise falls
 * back to that type's first option. Never touches event content — switching
 * type is a presentation change.
 */
export function resolveLayoutForType(type: TimelineType, current: TimelineLayout): TimelineLayout {
  return isLayoutValidForType(type, current) ? current : LAYOUTS_BY_TYPE[type][0];
}

export interface ThemePresetOption {
  id: TimelineThemePreset;
  name: string;
  description: string;
  /** Swatches for the selector chip: [background, surface, accent]. */
  swatch: [string, string, string];
}

export const THEME_PRESETS: ThemePresetOption[] = [
  {
    id: "canvas",
    name: "Canvas",
    description: "Clean neutral surface, indigo accent.",
    swatch: ["#f7f7fb", "#ffffff", "#5d4ee6"],
  },
  {
    id: "midnight",
    name: "Midnight",
    description: "Deep navy, violet and cyan accents.",
    swatch: ["#0d1020", "#171a2e", "#a78bfa"],
  },
  {
    id: "editorial",
    name: "Editorial",
    description: "Warm paper, ink text, terracotta accent.",
    swatch: ["#f8f3e9", "#fffdf8", "#b4552b"],
  },
];

export const DEFAULT_THEME_PRESET: TimelineThemePreset = "canvas";

/** Timelines saved before presets existed have no preset — they are Canvas. */
export function resolveThemePreset(preset: string | null | undefined): TimelineThemePreset {
  return THEME_PRESETS.some((option) => option.id === preset)
    ? (preset as TimelineThemePreset)
    : DEFAULT_THEME_PRESET;
}

/**
 * Layouts that need room sideways. The public viewer widens its container for
 * these so a horizontal track isn't squeezed into a reading-width column.
 */
const WIDE_LAYOUTS: readonly TimelineLayout[] = [
  "horizontal",
  "gantt",
  "roadmap",
  "calendar-board",
  "interactive",
  "branch",
];

export function isWideLayout(layout: TimelineLayout): boolean {
  return WIDE_LAYOUTS.includes(layout);
}
