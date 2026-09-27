"use client";

import { useId, useMemo, useRef, useState } from "react";
import { ToolWorkbench } from "../../../components/tools/ToolWorkbench";
import { actionPlanExampleInput } from "../../../content/tool-fixtures/notes-to-action-plan";
import { createServerRunner } from "../server-runner";
import type { ToolDefinition } from "../types";
import { ActionPlanEditor } from "./ActionPlanEditor";
import { DEPTH_LABELS, PLANNING_DEPTHS, type ActionPlan, type ActionPlanInputRaw, type PlanningDepth } from "./schema";
import styles from "./actionPlan.module.css";

interface Details {
  outcome: string;
  horizon: string;
  participants: string;
  depth: PlanningDepth;
}

const EMPTY: Details = { outcome: "", horizon: "", participants: "", depth: "standard" };
const EXAMPLE_DETAILS: Details = {
  outcome: actionPlanExampleInput.outcome ?? "",
  horizon: actionPlanExampleInput.horizon ?? "",
  participants: actionPlanExampleInput.participants ?? "",
  depth: actionPlanExampleInput.depth ?? "standard",
};

export function ActionPlanWorkbench({ tool }: { tool: ToolDefinition }) {
  const [details, setDetails] = useState<Details>(EMPTY);
  const disclosureRef = useRef<HTMLDetailsElement>(null);
  // The runner is created once; it reads the latest details from this ref.
  const detailsRef = useRef(details);
  detailsRef.current = details;
  const ids = { outcome: useId(), horizon: useId(), participants: useId(), depth: useId() };

  const isExample = (text: string) =>
    text === tool.example.input && (Object.keys(EXAMPLE_DETAILS) as (keyof Details)[]).every((k) => detailsRef.current[k] === EXAMPLE_DETAILS[k]);

  const runner = useMemo(
    () =>
      createServerRunner<ActionPlan>(tool.slug, {
        exampleText: tool.example.input,
        isExample,
        toInput: (text): ActionPlanInputRaw => ({ notes: text, ...detailsRef.current }),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isExample reads refs only
    [tool.slug, tool.example.input]
  );

  const set = (key: keyof Details) => (e: { target: { value: string } }) => setDetails((d) => ({ ...d, [key]: e.target.value }));

  return (
    <ToolWorkbench<ActionPlan>
      inputLabel="Notes, brief, or idea dump"
      inputPlaceholder="Paste meeting notes, a project brief, or a list of loose ideas…"
      exampleLabel={tool.example.label}
      exampleInput={tool.example.input}
      limits={tool.limits}
      runner={runner}
      isExample={isExample}
      optionsKey={JSON.stringify(details)}
      trackAs={tool.slug}
      onLoadExample={() => {
        setDetails(EXAMPLE_DETAILS);
        if (disclosureRef.current) disclosureRef.current.open = true;
      }}
      options={
        <details className={styles.details} ref={disclosureRef}>
          <summary>Optional details: outcome, horizon, participants, depth</summary>
          <div className={styles.detailFields}>
            <div className={styles.field}>
              <label htmlFor={ids.outcome}>Desired outcome</label>
              <input id={ids.outcome} value={details.outcome} onChange={set("outcome")} maxLength={300} placeholder="What does done look like?" />
            </div>
            <div className={styles.field}>
              <label htmlFor={ids.horizon}>Horizon</label>
              <input id={ids.horizon} value={details.horizon} onChange={set("horizon")} maxLength={100} placeholder="e.g. about 6 weeks" />
              <span className={styles.hint}>Shapes how much to plan. It never becomes a deadline on a task.</span>
            </div>
            <div className={styles.field}>
              <label htmlFor={ids.participants}>Participants and roles</label>
              <input id={ids.participants} value={details.participants} onChange={set("participants")} maxLength={500} placeholder="e.g. PM, designer, two engineers" />
              <span className={styles.hint}>Context only. The plan never assigns tasks to anyone.</span>
            </div>
            <div className={styles.field}>
              <label htmlFor={ids.depth}>Planning depth</label>
              <select id={ids.depth} value={details.depth} onChange={set("depth")}>
                {PLANNING_DEPTHS.map((d) => (
                  <option key={d} value={d}>
                    {DEPTH_LABELS[d]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </details>
      }
      renderResult={(plan, mode) => <ActionPlanEditor plan={plan} origin={mode === "live" ? "ai" : "fixture"} />}
    />
  );
}
