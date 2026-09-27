import "server-only";
import type { ToolErrorCode } from "../envelope";

/**
 * The only way the execution boundary logs. Fields are a closed, typed set
 * of low-cardinality operational facts; there is deliberately no free-form
 * field, so input text, output text, prompts, keys, and provider error
 * bodies cannot be passed in.
 */
export interface ToolRunLog {
  event: "tool_run";
  slug: string;
  toolVersion: string;
  requestMode: "example" | "live";
  servedMode: "fixture" | "live" | "none";
  outcome: "succeeded" | "degraded" | ToolErrorCode;
  durationMs: number;
  replayed: boolean;
  model: string | null;
  fallbackUsed: boolean;
  costRecorded: boolean;
}

export interface ToolConfigLog {
  event: "tool_config";
  slug: string;
  /** Operator notes from config resolution (never secrets or user content). */
  notes: string[];
}

export type ToolLogger = (entry: ToolRunLog | ToolConfigLog) => void;

export const consoleToolLogger: ToolLogger = (entry) => {
  console.info(JSON.stringify({ scope: "ai-tools", ...entry }));
};
