"use client";

import { useMemo } from "react";
import { ToolExport } from "../../../components/tools/ToolExport";
import { ToolWorkbench } from "../../../components/tools/ToolWorkbench";
import { createServerRunner } from "../server-runner";
import type { ToolDefinition } from "../types";
import { ReferenceResultView } from "./ReferenceResultView";
import { referenceResultToMarkdown, type ReferenceResult } from "./schema";

export function ShellReferenceWorkbench({ tool }: { tool: ToolDefinition }) {
  const runner = useMemo(
    () =>
      createServerRunner<ReferenceResult>(tool.slug, {
        exampleText: tool.example.input,
        toInput: (text) => ({ text }),
      }),
    [tool.slug, tool.example.input]
  );

  return (
    <ToolWorkbench<ReferenceResult>
      inputLabel="Your notes"
      inputPlaceholder="Paste a few lines of meeting or planning notes…"
      exampleLabel={tool.example.label}
      exampleInput={tool.example.input}
      limits={tool.limits}
      runner={runner}
      renderResult={(result) => <ReferenceResultView result={result} />}
      resultActions={(result) => (
        <ToolExport filenameBase={`${tool.slug}-checklist`} json={result} markdown={referenceResultToMarkdown(result)} />
      )}
    />
  );
}
