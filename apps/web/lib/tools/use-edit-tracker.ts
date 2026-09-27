"use client";

import { useCallback, useRef } from "react";
import { EDIT_ACTIONS, trackToolEvent } from "./analytics";
import type { ToolSlug } from "./types";
import { TOOL_VERSIONS } from "./versions";

/**
 * Records `ai_tool_result_edited` at most once per action type per result,
 * and `ai_tool_exported` per download (#682). Nothing about the content.
 */
export function useResultTracking(tool: ToolSlug) {
  const seen = useRef(new Set<string>());
  const base = { tool, tool_version: TOOL_VERSIONS[tool] };
  const edited = useCallback(
    (action: (typeof EDIT_ACTIONS)[number]) => {
      if (seen.current.has(action)) return;
      seen.current.add(action);
      trackToolEvent({ name: "ai_tool_result_edited", props: { ...base, action } });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- base is derived from tool
    [tool]
  );
  const exported = useCallback(
    (format: "markdown" | "json") => trackToolEvent({ name: "ai_tool_exported", props: { ...base, format } }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- base is derived from tool
    [tool]
  );
  return { edited, exported, reset: () => seen.current.clear() };
}
