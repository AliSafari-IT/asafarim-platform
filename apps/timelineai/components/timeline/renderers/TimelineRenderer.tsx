import { VerticalTimeline } from "./VerticalTimeline";
import { HorizontalTimeline } from "./HorizontalTimeline";
import { ZigzagTimeline } from "./ZigzagTimeline";
import { RadialTimeline } from "./RadialTimeline";
import { RoadmapTimeline } from "./RoadmapTimeline";
import { GanttTimeline } from "./GanttTimeline";
import { CalendarTimeline } from "./CalendarTimeline";
import { InteractiveTimeline } from "./InteractiveTimeline";
import { BranchTimeline } from "./BranchTimeline";
import type { RenderableTimeline } from "./types";
import type { TimelineInput } from "@/lib/schemas";

/**
 * Layout dispatch — the single place that maps a Timeline.layout value to
 * its renderer. Content (title/events) stays identical across every
 * branch; only presentation changes, so switching layout never loses data.
 */
export function TimelineRenderer({
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
    case "interactive":
      return <InteractiveTimeline timeline={timeline} />;
    case "branch":
      return <BranchTimeline timeline={timeline} />;
    case "vertical":
    default:
      return <VerticalTimeline timeline={timeline} />;
  }
}
