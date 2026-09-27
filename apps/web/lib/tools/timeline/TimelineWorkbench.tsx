"use client";

import { useId, useMemo, useRef, useState } from "react";
import { ToolWorkbench } from "../../../components/tools/ToolWorkbench";
import { timelineExampleInput } from "../../../content/tool-fixtures/text-to-cited-timeline";
import { createServerRunner } from "../server-runner";
import type { ToolDefinition } from "../types";
import { DETAIL_LABELS, DETAIL_LEVELS, type CitedTimeline, type DetailLevel, type TimelineInputRaw } from "./schema";
import { TimelineEditor } from "./TimelineEditor";
import styles from "./timeline.module.css";

interface Details {
  title: string;
  audience: string;
  dateRange: string;
  detail: DetailLevel;
}

const EMPTY: Details = { title: "", audience: "", dateRange: "", detail: "standard" };
const EXAMPLE_DETAILS: Details = {
  title: timelineExampleInput.title ?? "",
  audience: timelineExampleInput.audience ?? "",
  dateRange: timelineExampleInput.dateRange ?? "",
  detail: timelineExampleInput.detail ?? "standard",
};

export function TimelineWorkbench({ tool }: { tool: ToolDefinition }) {
  const [details, setDetails] = useState<Details>(EMPTY);
  const disclosureRef = useRef<HTMLDetailsElement>(null);
  const detailsRef = useRef(details);
  detailsRef.current = details;
  const ids = { title: useId(), audience: useId(), dateRange: useId(), detail: useId() };

  const isExample = (text: string) =>
    text === tool.example.input && (Object.keys(EXAMPLE_DETAILS) as (keyof Details)[]).every((k) => detailsRef.current[k] === EXAMPLE_DETAILS[k]);

  const runner = useMemo(
    () =>
      createServerRunner<CitedTimeline>(tool.slug, {
        exampleText: tool.example.input,
        isExample,
        toInput: (text): TimelineInputRaw => ({ text, ...detailsRef.current }),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isExample reads refs only
    [tool.slug, tool.example.input]
  );

  const set = (key: keyof Details) => (e: { target: { value: string } }) => setDetails((d) => ({ ...d, [key]: e.target.value }));

  return (
    <ToolWorkbench<CitedTimeline>
      inputLabel="Text with dated events"
      inputPlaceholder="Paste an article, a history, meeting minutes, or research notes that mention dates…"
      exampleLabel={tool.example.label}
      exampleInput={tool.example.input}
      limits={tool.limits}
      runner={runner}
      isExample={isExample}
      optionsKey={JSON.stringify(details)}
      onLoadExample={() => {
        setDetails(EXAMPLE_DETAILS);
        if (disclosureRef.current) disclosureRef.current.open = true;
      }}
      options={
        <details className={styles.details} ref={disclosureRef}>
          <summary>Optional details: title, audience, date range, level of detail</summary>
          <div className={styles.detailFields}>
            <div className={styles.field}>
              <label htmlFor={ids.title}>Title</label>
              <input id={ids.title} value={details.title} onChange={set("title")} maxLength={120} />
            </div>
            <div className={styles.field}>
              <label htmlFor={ids.audience}>Audience</label>
              <input id={ids.audience} value={details.audience} onChange={set("audience")} maxLength={120} placeholder="e.g. students, a project team" />
            </div>
            <div className={styles.field}>
              <label htmlFor={ids.dateRange}>Date range to focus on</label>
              <input id={ids.dateRange} value={details.dateRange} onChange={set("dateRange")} maxLength={100} placeholder="e.g. 1950–1990" />
              <span className={styles.hint}>A focus, not a filter: conflicting events outside it are still shown.</span>
            </div>
            <div className={styles.field}>
              <label htmlFor={ids.detail}>Level of detail</label>
              <select id={ids.detail} value={details.detail} onChange={set("detail")}>
                {DETAIL_LEVELS.map((d) => (
                  <option key={d} value={d}>
                    {DETAIL_LABELS[d]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </details>
      }
      renderResult={(timeline, mode) => <TimelineEditor timeline={timeline} origin={mode === "live" ? "ai" : "fixture"} />}
    />
  );
}
