"use client";

import { useEffect, useId, useReducer, useRef, useState, type ReactNode } from "react";
import { Button } from "@asafarim/ui";
import { checkInput, isConcluded, toolRunReducer, type ToolRunState } from "../../lib/tools/run-state";
import { runOutcomeEvent, trackToolEvent } from "../../lib/tools/analytics";
import { describeRunState } from "../../lib/tools/status-copy";
import type { ToolLimits, ToolRunMode, ToolRunner, ToolSlug } from "../../lib/tools/types";
import { TOOL_VERSIONS } from "../../lib/tools/versions";
import { ToolOutcome } from "./ToolOutcome";
import styles from "./tools.module.css";

export interface ToolWorkbenchProps<TResult> {
  inputLabel: string;
  inputPlaceholder?: string;
  exampleLabel: string;
  exampleInput: string;
  limits: ToolLimits;
  runner: ToolRunner<TResult>;
  renderResult: (result: TResult, mode: ToolRunMode) => ReactNode;
  resultActions?: (result: TResult, mode: ToolRunMode) => ReactNode;
  /** Extra, tool-owned fields rendered under the main input. */
  options?: ReactNode;
  /** Called with the example button, so a tool can fill its extra fields too. */
  onLoadExample?: () => void;
  /** Whether the current input is the example; defaults to `text === exampleInput`. */
  isExample?: (text: string) => boolean;
  /** Change it when extra fields change, so the example/ready state is recomputed. */
  optionsKey?: string;
  /** Which tool to attribute allowlisted analytics events to (#682). */
  trackAs?: ToolSlug;
}

/**
 * The interactive part of every tool: input, example, run, status, result.
 *
 * Accessibility: a polite live region announces start/finish; focus moves to
 * the status panel when a run concludes so keyboard and screen-reader users
 * land on the outcome. A run in flight is aborted on unmount and cannot be
 * double-submitted.
 */
export function ToolWorkbench<TResult>({
  inputLabel,
  inputPlaceholder,
  exampleLabel,
  exampleInput,
  limits,
  runner,
  renderResult,
  resultActions,
  options,
  onLoadExample,
  isExample = (text) => text === exampleInput,
  optionsKey,
  trackAs,
}: ToolWorkbenchProps<TResult>) {
  const base = trackAs ? { tool: trackAs, tool_version: TOOL_VERSIONS[trackAs] } : null;
  const [input, setInput] = useState("");
  const [state, dispatch] = useReducer(toolRunReducer<TResult>, { kind: "idle" } as ToolRunState<TResult>);
  const [announcement, setAnnouncement] = useState("");
  const statusRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputId = useId();
  const hintId = useId();

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (state.kind === "running") setAnnouncement("Working on it…");
    else if (isConcluded(state)) {
      setAnnouncement(describeRunState(state).title);
      statusRef.current?.focus();
    }
  }, [state]);

  function changeInput(next: string) {
    setInput(next);
    dispatch({ type: "input-changed", input: next, isExample: isExample(next), limits });
  }

  // Extra fields changed: recompute whether this is still the example.
  useEffect(() => {
    if (optionsKey === undefined) return;
    dispatch({ type: "input-changed", input, isExample: isExample(input), limits });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on option changes
  }, [optionsKey]);

  async function run() {
    if (state.kind === "running") return;
    const issues = checkInput(input, limits);
    if (issues.length) {
      dispatch({ type: "input-rejected", issues });
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    dispatch({ type: "run-started" });
    if (base) trackToolEvent({ name: "ai_tool_run_started", props: { ...base, input: isExample(input) ? "example" : "own" } });
    try {
      const outcome = await runner(input, controller.signal);
      if (!controller.signal.aborted) {
        dispatch({ type: "run-finished", outcome });
        const event = base ? runOutcomeEvent(base, outcome as Parameters<typeof runOutcomeEvent>[1]) : null;
        if (event) trackToolEvent(event);
      }
    } catch {
      if (!controller.signal.aborted) {
        dispatch({ type: "run-finished", outcome: { kind: "failed" } });
        if (base) trackToolEvent({ name: "ai_tool_run_failed", props: { ...base, category: "failed" } });
      }
    }
  }

  const running = state.kind === "running";
  const overLimit = input.length > limits.maxInputChars;

  return (
    <div className={styles.field}>
      <div className={styles.field}>
        <label htmlFor={inputId}>{inputLabel}</label>
        <textarea
          id={inputId}
          className={styles.textarea}
          value={input}
          placeholder={inputPlaceholder}
          onChange={(e) => changeInput(e.target.value)}
          aria-describedby={hintId}
          aria-invalid={state.kind === "invalid" || overLimit ? true : undefined}
          spellCheck
        />
        <div id={hintId} className={styles.hint}>
          <span>Don&apos;t paste passwords, API keys, or sensitive personal information.</span>
          <span className={overLimit ? styles.overLimit : undefined}>
            {input.length.toLocaleString("en")} / {limits.maxInputChars.toLocaleString("en")} characters
          </span>
        </div>
      </div>

      {options}

      <div className={styles.actions}>
        <Button type="button" variant="primary" onClick={run} disabled={running} aria-disabled={running}>
          {running ? "Running…" : "Run"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => {
            // Extra fields update on the next render; optionsKey then recomputes the example state.
            onLoadExample?.();
            changeInput(exampleInput);
            if (base) trackToolEvent({ name: "ai_tool_example_loaded", props: base });
          }}
          disabled={running}
        >
          {exampleLabel}
        </Button>
      </div>

      <p className={styles.srOnly} role="status" aria-live="polite">
        {announcement}
      </p>

      <ToolOutcome state={state} renderResult={renderResult} resultActions={resultActions} statusRef={statusRef} />
    </div>
  );
}
