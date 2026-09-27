"use client";

import { useMemo } from "react";
import { ToolExport } from "../../../components/tools/ToolExport";
import { ToolWorkbench } from "../../../components/tools/ToolWorkbench";
import { createFixtureRunner } from "../fixture-runner";
import type { ToolDefinition } from "../types";
import { ReferenceResultView } from "./ReferenceResultView";
import { referenceResultToMarkdown, type ReferenceResult } from "./schema";

export function ShellReferenceWorkbench({ tool }: { tool: ToolDefinition }) {
  const example = tool.example as { input: string; output: ReferenceResult };
  const runner = useMemo(() => createFixtureRunner(example), [example]);

  return (
    <ToolWorkbench<ReferenceResult>
      inputLabel="Your notes"
      inputPlaceholder="Paste a few lines of meeting or planning notes…"
      exampleLabel={tool.example.label}
      exampleInput={example.input}
      limits={tool.limits}
      runner={runner}
      renderResult={(result) => <ReferenceResultView result={result} />}
      resultActions={(result) => (
        <ToolExport filenameBase={`${tool.slug}-checklist`} json={result} markdown={referenceResultToMarkdown(result)} />
      )}
    />
  );
}
