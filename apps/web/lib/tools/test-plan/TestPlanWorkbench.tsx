"use client";

import { useId, useMemo, useRef, useState } from "react";
import { ToolWorkbench } from "../../../components/tools/ToolWorkbench";
import { testPlanExampleInput } from "../../../content/tool-fixtures/requirements-to-test-plan";
import { createServerRunner } from "../server-runner";
import type { ToolDefinition } from "../types";
import type { TestPlan, TestPlanInputRaw } from "./schema";
import { TestPlanEditor } from "./TestPlanEditor";
import styles from "./testPlan.module.css";

interface Details {
  acceptanceCriteria: string;
  title: string;
  context: string;
  platforms: string;
}

const EMPTY: Details = { acceptanceCriteria: "", title: "", context: "", platforms: "" };
const EXAMPLE_DETAILS: Details = {
  acceptanceCriteria: testPlanExampleInput.acceptanceCriteria ?? "",
  title: testPlanExampleInput.title ?? "",
  context: testPlanExampleInput.context ?? "",
  platforms: testPlanExampleInput.platforms ?? "",
};

export function TestPlanWorkbench({ tool }: { tool: ToolDefinition }) {
  const [details, setDetails] = useState<Details>(EMPTY);
  const disclosureRef = useRef<HTMLDetailsElement>(null);
  // The runner is created once; it reads the latest details from this ref.
  const detailsRef = useRef(details);
  detailsRef.current = details;
  const ids = { criteria: useId(), title: useId(), context: useId(), platforms: useId() };

  const isExample = (text: string) =>
    text === tool.example.input &&
    (Object.keys(EXAMPLE_DETAILS) as (keyof Details)[]).every((k) => detailsRef.current[k] === EXAMPLE_DETAILS[k]);

  const runner = useMemo(
    () =>
      createServerRunner<TestPlan>(tool.slug, {
        exampleText: tool.example.input,
        isExample,
        toInput: (text): TestPlanInputRaw => ({
          requirement: text,
          acceptanceCriteria: detailsRef.current.acceptanceCriteria,
          title: detailsRef.current.title,
          context: detailsRef.current.context,
          platforms: detailsRef.current.platforms,
        }),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isExample reads refs only
    [tool.slug, tool.example.input]
  );

  const set = (key: keyof Details) => (e: { target: { value: string } }) => setDetails((d) => ({ ...d, [key]: e.target.value }));

  return (
    <ToolWorkbench<TestPlan>
      inputLabel="Requirement or user story"
      inputPlaceholder="As a … I want … so that …"
      exampleLabel={tool.example.label}
      exampleInput={tool.example.input}
      limits={tool.limits}
      runner={runner}
      isExample={isExample}
      optionsKey={JSON.stringify(details)}
      onLoadExample={() => {
        setDetails(EXAMPLE_DETAILS);
        // Uncontrolled <details>: open it directly so the filled fields are visible.
        if (disclosureRef.current) disclosureRef.current.open = true;
      }}
      options={
        <details className={styles.details} ref={disclosureRef}>
          <summary>Optional details: acceptance criteria, title, context, platforms</summary>
          <div className={styles.detailFields}>
            <div className={styles.field}>
              <label htmlFor={ids.criteria}>Acceptance criteria</label>
              <textarea id={ids.criteria} rows={6} value={details.acceptanceCriteria} onChange={set("acceptanceCriteria")} maxLength={4000} />
              <span className={styles.hint}>One per line. Each line becomes a numbered source (R2, R3, …) that scenarios can point to.</span>
            </div>
            <div className={styles.field}>
              <label htmlFor={ids.title}>Title</label>
              <input id={ids.title} value={details.title} onChange={set("title")} maxLength={120} />
            </div>
            <div className={styles.field}>
              <label htmlFor={ids.platforms}>Platforms or browsers in scope</label>
              <input id={ids.platforms} value={details.platforms} onChange={set("platforms")} maxLength={300} placeholder="e.g. Web: Chrome, Safari; iOS app" />
            </div>
            <div className={styles.field}>
              <label htmlFor={ids.context}>Product context</label>
              <textarea id={ids.context} rows={3} value={details.context} onChange={set("context")} maxLength={1500} />
              <span className={styles.hint}>Background only. Scenarios can&apos;t cite it as a requirement.</span>
            </div>
          </div>
        </details>
      }
      renderResult={(plan, mode) => <TestPlanEditor plan={plan} origin={mode === "live" ? "ai" : "fixture"} />}
    />
  );
}
