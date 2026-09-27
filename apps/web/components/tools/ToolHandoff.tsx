"use client";

import { useState } from "react";
import { Button, getPlatformLinks } from "@asafarim/ui";
import { DESTINATION_NAMES, HANDOFF_FILE_SUFFIX, HANDOFF_TTL_DAYS, IMPORT_PATH, type Destination, type HandoffEnvelope } from "@asafarim/tool-handoff";
import { trackToolEvent } from "../../lib/tools/analytics";
import type { ToolSlug } from "../../lib/tools/types";
import styles from "./tools.module.css";

const LINK_KEY = { testora: "testora", tasksai: "tasksai", timelineai: "timelineai" } as const satisfies Record<Destination, string>;

/**
 * "Continue in <app>" (#678). Downloads a handoff file built from the
 * current selection, then points to the destination's import page, where
 * the visitor signs in, previews, and confirms. The link carries no content:
 * the result only travels in the file the visitor chooses to upload.
 */
export function ToolHandoff({ destination, build, what }: { destination: Destination; build: () => HandoffEnvelope | null; what: string }) {
  const [downloaded, setDownloaded] = useState(false);
  const name = DESTINATION_NAMES[destination];
  const importUrl = `${getPlatformLinks()[LINK_KEY[destination]]}${IMPORT_PATH}`;

  const download = () => {
    const envelope = build();
    if (!envelope) return;
    const url = URL.createObjectURL(new Blob([`${JSON.stringify(envelope, null, 2)}\n`], { type: "application/json;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${envelope.source.tool}-${envelope.handoffId.slice(0, 8)}${HANDOFF_FILE_SUFFIX}`;
    link.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
    trackToolEvent({ name: "ai_tool_handoff_started", props: { tool: envelope.source.tool as ToolSlug, tool_version: envelope.source.toolVersion, destination } });
  };

  return (
    <div className={styles.handoff} role="group" aria-label={`Continue in ${name}`}>
      <p className={styles.handoffTitle}>
        <strong>Continue in {name}</strong>
      </p>
      <ol className={styles.handoffSteps}>
        <li>Download a handoff file with {what}.</li>
        <li>
          Open {name}&apos;s import page and sign in if asked. You&apos;ll see exactly what will be created before anything is saved.
        </li>
      </ol>
      <div className={styles.actions}>
        <Button type="button" size="sm" variant="secondary" onClick={download}>
          Download for {name}
        </Button>
        <a className={styles.handoffLink} href={importUrl} rel="noopener">
          Open {name} import →
        </a>
      </div>
      <p className={styles.muted} role="status" aria-live="polite">
        {downloaded ? `File downloaded. It works for ${HANDOFF_TTL_DAYS} days and holds only what you selected; nothing was sent to ${name}.` : ""}
      </p>
    </div>
  );
}
