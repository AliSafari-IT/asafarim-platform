import { TIMELINE_TYPES, TIMELINE_LAYOUTS } from "./schemas";

export const TYPE_LABELS: Record<(typeof TIMELINE_TYPES)[number], string> = {
  general: "General",
  project: "Project",
  historical: "Historical / storytelling",
  roadmap: "Roadmap",
  gantt: "Gantt (project schedule)",
  calendar: "Calendar",
  interactive: "Interactive",
};

export const LAYOUT_LABELS: Record<(typeof TIMELINE_LAYOUTS)[number], string> = {
  vertical: "Vertical",
  horizontal: "Horizontal",
  zigzag: "Zigzag",
  radial: "Circular",
  roadmap: "Roadmap",
  gantt: "Gantt",
  calendar: "Calendar",
  interactive: "Interactive",
  branch: "Branching (interactive, dark)",
};
