"use client";

import { useEffect, useId, useReducer, useRef, useState, type ReactNode } from "react";
import { Button } from "@asafarim/ui";
import { checkInput, isConcluded, toolRunReducer, type ToolRunState } from "../../lib/tools/run-state";
import { describeRunState } from "../../lib/tools/status-copy";
import type { ToolLimits, ToolRunMode, ToolRunner } from "../../lib/tools/types";
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
}: ToolWorkbenchProps<TResult>) {
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
    dispatch({ type: "input-changed", input: next, exampleInput, limits });
  }

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
    try {
      const outcome = await runner(input, controller.signal);
      if (!controller.signal.aborted) dispatch({ type: "run-finished", outcome });
    } catch {
      if (!controller.signal.aborted) dispatch({ type: "run-finished", outcome: { kind: "failed" } });
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

      <div className={styles.actions}>
        <Button type="button" variant="primary" onClick={run} disabled={running} aria-disabled={running}>
          {running ? "Running…" : "Run"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => changeInput(exampleInput)} disabled={running}>
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
