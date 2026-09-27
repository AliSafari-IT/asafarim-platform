"use client";

import { Button } from "@asafarim/ui";
import styles from "./tools.module.css";

export interface ToolExportProps {
  filenameBase: string;
  json: unknown;
  markdown?: string;
  /** Called after a download starts; for allowlisted analytics only. */
  onExport?: (format: "markdown" | "json") => void;
}

/** Client-side download of the reviewed result. Nothing is sent to a server. */
export function ToolExport({ filenameBase, json, markdown, onExport }: ToolExportProps) {
  return (
    <div className={styles.actions} role="group" aria-label="Export result">
      {markdown !== undefined ? (
        <Button variant="secondary" size="sm" onClick={() => {
          download(`${filenameBase}.md`, markdown, "text/markdown");
          onExport?.("markdown");
        }}>
          Download Markdown
        </Button>
      ) : null}
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          download(`${filenameBase}.json`, `${JSON.stringify(json, null, 2)}\n`, "application/json");
          onExport?.("json");
        }}
      >
        Download JSON
      </Button>
    </div>
  );
}

function download(filename: string, contents: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: `${type};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
