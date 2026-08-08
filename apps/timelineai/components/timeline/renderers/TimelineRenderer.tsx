import { VerticalTimeline } from "./VerticalTimeline";
import type { RenderableTimeline } from "./types";
import type { TimelineInput } from "@/lib/schemas";

/**
 * Layout dispatch. Only "vertical" is implemented so far (Task #4/#5);
 * every other layout falls back to it for now rather than erroring, so
 * switching layout in the editor never loses data or breaks the preview —
 * the remaining renderers land in a follow-up (horizontal/roadmap/gantt/
 * calendar/zigzag/radial).
 */
export function TimelineRenderer({
  layout,
  timeline,
}: {
  layout: TimelineInput["layout"];
  timeline: RenderableTimeline;
}) {
  switch (layout) {
    case "vertical":
    default:
      return <VerticalTimeline timeline={timeline} />;
  }
}
