"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { trackToolEvent } from "../../lib/tools/analytics";
import type { ToolLifecycle, ToolSlug } from "../../lib/tools/types";
import { TOOL_VERSIONS } from "../../lib/tools/versions";

/** Fires `ai_tool_view` once per page view (#682). Renders nothing. */
export function ToolViewTracker({ tool, lifecycle }: { tool: ToolSlug; lifecycle: ToolLifecycle }) {
  // Once per mount, even when development re-runs effects.
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    trackToolEvent({ name: "ai_tool_view", props: { tool, tool_version: TOOL_VERSIONS[tool], lifecycle } });
  }, [tool, lifecycle]);
  return null;
}

/** A plain, crawlable link that also records an allowlisted event when followed. */
export function TrackedToolLink({
  href,
  tool,
  event,
  children,
}: {
  href: string;
  tool: ToolSlug;
  event: "ai_tool_case_study_opened" | "ai_tool_contact_opened";
  children: ReactNode;
}) {
  return (
    <a href={href} onClick={() => trackToolEvent({ name: event, props: { tool, tool_version: TOOL_VERSIONS[tool] } })}>
      {children}
    </a>
  );
}
