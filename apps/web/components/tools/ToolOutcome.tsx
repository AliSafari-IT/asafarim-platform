import type { ReactNode, Ref } from "react";
import type { ToolRunState } from "../../lib/tools/run-state";
import { describeRunState } from "../../lib/tools/status-copy";
import type { ToolRunMode } from "../../lib/tools/types";
import styles from "./tools.module.css";

export interface ToolOutcomeProps<TResult> {
  state: ToolRunState<TResult>;
  renderResult: (result: TResult, mode: ToolRunMode) => ReactNode;
  /** Rendered under a result only (export, handoff). */
  resultActions?: (result: TResult, mode: ToolRunMode) => ReactNode;
  /** Receives focus when a run concludes. */
  statusRef?: Ref<HTMLDivElement>;
}

/**
 * Presentational status + result area. Stateless so every state can be
 * verified with static rendering. Only `success`/`degraded` render a result;
 * every other state renders status copy that says no result was produced.
 */
export function ToolOutcome<TResult>({ state, renderResult, resultActions, statusRef }: ToolOutcomeProps<TResult>) {
  const copy = describeRunState(state);
  const hasResult = state.kind === "success" || state.kind === "degraded";

  return (
    <div className={styles.field} data-state={state.kind}>
      <div ref={statusRef} tabIndex={-1} className={`${styles.status} ${styles[`tone-${copy.tone}`] ?? ""}`}>
        <p className={styles.statusTitle}>
          {state.kind === "running" ? <span className={styles.spinner} aria-hidden="true" /> : null}
          {copy.title}
        </p>
        {copy.body ? <p>{copy.body}</p> : null}
      </div>
      {hasResult ? (
        <div data-result-mode={state.mode}>
          {renderResult(state.result, state.mode)}
          {resultActions ? resultActions(state.result, state.mode) : null}
        </div>
      ) : null}
    </div>
  );
}
