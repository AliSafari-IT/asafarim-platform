import { VerticalTimeline } from "./VerticalTimeline";
import { HorizontalTimeline } from "./HorizontalTimeline";
import { ZigzagTimeline } from "./ZigzagTimeline";
import { RadialTimeline } from "./RadialTimeline";
import { RoadmapTimeline } from "./RoadmapTimeline";
import { GanttTimeline } from "./GanttTimeline";
import { CalendarTimeline } from "./CalendarTimeline";
import { CalendarBoardTimeline } from "./CalendarBoardTimeline";
import { InteractiveTimeline } from "./InteractiveTimeline";
import { BranchTimeline } from "./BranchTimeline";
import type { RenderableTimeline } from "./types";
import type { TimelineInput } from "@/lib/schemas";
import { resolveThemePreset } from "@/lib/timeline-config";

/**
 * Layout dispatch AND the themed viewer boundary — the single place that maps
 * a Timeline.layout value to its renderer, and the single place `.tl-root`
 * exists.
 *
 * Owning the wrapper here is what makes one theme apply to every layout: the
 * individual renderers below render only their structure, inherit the --tl-*
 * tokens, and never nest a second .tl-root. It also means the editor preview,
 * the public page, and the export pipeline all get the theme automatically,
 * because all three render through this component.
 *
 * Content (title/events) stays identical across every branch; only
 * presentation changes, so switching layout never loses data.
 */
export function TimelineRenderer({
  layout,
  timeline,
}: {
  layout: TimelineInput["layout"];
  timeline: RenderableTimeline;
}) {
  const theme = timeline.theme ?? {};
  const preset = resolveThemePreset(theme.preset);

  // Saved per-timeline overrides win over the preset's defaults. Only keys the
  // author actually set are emitted, so an unset field keeps inheriting from
  // the preset rather than being pinned to a computed value.
  const overrides: Record<string, string> = {};
  if (theme.accentColor) overrides["--tl-accent"] = theme.accentColor;
  if (theme.connectorColor) overrides["--tl-connector"] = theme.connectorColor;
  if (theme.fontFamily) overrides["--tl-body-font"] = theme.fontFamily;

  return (
    <div
      className="tl-root"
      data-layout={layout}
      data-timeline-theme={preset}
      data-density={theme.density ?? "comfortable"}
      data-card-style={theme.cardStyle ?? "flat"}
      style={overrides}
    >
      <Layout layout={layout} timeline={timeline} />
    </div>
  );
}

function Layout({
  layout,
  timeline,
}: {
  layout: TimelineInput["layout"];
  timeline: RenderableTimeline;
}) {
  switch (layout) {
    case "horizontal":
      return <HorizontalTimeline timeline={timeline} />;
    case "zigzag":
      return <ZigzagTimeline timeline={timeline} />;
    case "radial":
      return <RadialTimeline timeline={timeline} />;
    case "roadmap":
      return <RoadmapTimeline timeline={timeline} />;
    case "gantt":
      return <GanttTimeline timeline={timeline} />;
    case "calendar":
      return <CalendarTimeline timeline={timeline} />;
    case "calendar-board":
      return <CalendarBoardTimeline timeline={timeline} />;
    case "interactive":
      return <InteractiveTimeline timeline={timeline} />;
    case "branch":
      return <BranchTimeline timeline={timeline} />;
    case "vertical":
    default:
      return <VerticalTimeline timeline={timeline} />;
  }
}
