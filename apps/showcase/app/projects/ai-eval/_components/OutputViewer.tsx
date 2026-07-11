"use client";

import { useMemo, useState } from "react";
import type { ScenarioDetail } from "../_data/types";
import { ScoreBar } from "./ScoreBar";
import { pretty } from "./format";
import styles from "./ai-eval.module.css";

type Tab = "prompt" | "input" | "output" | "expected";

/**
 * Read-only inspector over the recorded evaluation: pick a scenario, case, and
 * model, then view the exact prompt, input, model output, and expected output.
 */
export function OutputViewer({ scenarios }: { scenarios: ScenarioDetail[] }) {
  const [scenarioKey, setScenarioKey] = useState(scenarios[0]?.scenario ?? "");
  const scenario = scenarios.find((s) => s.scenario === scenarioKey) ?? scenarios[0];
  const [caseId, setCaseId] = useState(scenario?.cases[0]?.caseId ?? "");
  const [modelId, setModelId] = useState("compact-c");
  const [tab, setTab] = useState<Tab>("output");

  const current = useMemo(() => {
    const sc = scenarios.find((s) => s.scenario === scenarioKey) ?? scenarios[0];
    const c = sc?.cases.find((x) => x.caseId === caseId) ?? sc?.cases[0];
    const r = c?.results.find((x) => x.modelId === modelId) ?? c?.results[0];
    return { sc, c, r };
  }, [scenarios, scenarioKey, caseId, modelId]);

  if (!current.sc || !current.c || !current.r) return null;
  const { sc, c, r } = current;

  const onScenario = (key: string) => {
    setScenarioKey(key);
    const next = scenarios.find((s) => s.scenario === key);
    setCaseId(next?.cases[0]?.caseId ?? "");
  };

  const tabs: Array<[Tab, string]> = [
    ["prompt", "Prompt"],
    ["input", "Input"],
    ["output", "Output"],
    ["expected", "Expected"],
  ];

  return (
    <div className={styles.viewer}>
      <div className={styles.viewerControls}>
        <div className={styles.selects}>
          <select
            className={styles.select}
            aria-label="Scenario"
            value={sc.scenario}
            onChange={(e) => onScenario(e.target.value)}
          >
            {scenarios.map((s) => (
              <option key={s.scenario} value={s.scenario}>{s.title}</option>
            ))}
          </select>
          <select
            className={styles.select}
            aria-label="Case"
            value={c.caseId}
            onChange={(e) => setCaseId(e.target.value)}
          >
            {sc.cases.map((x) => (
              <option key={x.caseId} value={x.caseId}>
                {x.caseId}{x.safetyProbe ? " (safety)" : ""}
              </option>
            ))}
          </select>
          <select
            className={styles.select}
            aria-label="Model"
            value={r.modelId}
            onChange={(e) => setModelId(e.target.value)}
          >
            {c.results.map((x) => (
              <option key={x.modelId} value={x.modelId}>{x.label}</option>
            ))}
          </select>
        </div>
        <div className={styles.tabs} role="tablist" aria-label="Artifact">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              className={styles.tab}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.pane}>
        {tab === "prompt" ? (
          <pre className={styles.code}>{`# system (${sc.prompt.version})\n${sc.prompt.system}\n\n# instruction\n${sc.prompt.instruction}`}</pre>
        ) : null}
        {tab === "input" ? <pre className={styles.code}>{pretty(c.input)}</pre> : null}
        {tab === "expected" ? <pre className={styles.code}>{pretty(c.expected)}</pre> : null}
        {tab === "output" ? (
          <>
            <pre className={styles.code}>{pretty(r.output)}</pre>
            <div className={styles.scoreRow}>
              <span>correctness <ScoreBar value={r.scores.correctness} /></span>
              <span>format <ScoreBar value={r.scores.format} /></span>
              {r.scores.groundedness != null ? (
                <span>grounded <ScoreBar value={r.scores.groundedness} /></span>
              ) : null}
              {r.scores.safety != null ? (
                <span>safety <ScoreBar value={r.scores.safety} /></span>
              ) : null}
            </div>
            {r.note ? <p className={styles.paneCaption}>Reviewer note: {r.note}</p> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
