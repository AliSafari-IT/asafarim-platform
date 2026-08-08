"use client";

import { useRouter } from "next/navigation";
import { TimelineEditor, type TimelineEditorProps } from "./TimelineEditor";

/** Thin client wrapper so the (async, server) edit page can still redirect
 * back to the dashboard after a successful save. */
export function EditTimelineClient(props: Omit<TimelineEditorProps, "onSaved">) {
  const router = useRouter();
  return <TimelineEditor {...props} onSaved={() => router.push("/dashboard")} />;
}
