import "server-only";
import { DEFAULT_RECONCILIATION_POLICY, trailingWindow } from "@asafarim/ai-cost-ledger";
import { getNumberSetting } from "@asafarim/db";
import { notifyDiscord } from "../discord-notify";
import { getProviderAdapters } from "./adapters";
import { getInternalSources } from "./internal-sources";
import { STALE_RUN_MS, runReconciliation, type RunOutcome } from "./run";
import { prismaReconciliationStore } from "./store";

/** Default window: long enough to catch late provider adjustments past the 48 h settle window. */
export const DEFAULT_WINDOW_DAYS = 7;
export const MAX_WINDOW_DAYS = 31;

export async function startReconciliation(input: {
  trigger: "manual" | "scheduled";
  triggeredBy: string | null;
  days?: number;
}): Promise<RunOutcome> {
  const days = Math.min(Math.max(Math.trunc(input.days ?? DEFAULT_WINDOW_DAYS), 1), MAX_WINDOW_DAYS);
  const driftBps = await getNumberSetting("ai.costReconciliation.driftBps", DEFAULT_RECONCILIATION_POLICY.driftBps).catch(
    () => DEFAULT_RECONCILIATION_POLICY.driftBps,
  );
  return runReconciliation(
    { trigger: input.trigger, triggeredBy: input.triggeredBy, window: trailingWindow(new Date(), days) },
    {
      store: prismaReconciliationStore,
      adapters: await getProviderAdapters(),
      internalSources: getInternalSources(),
      policy: { ...DEFAULT_RECONCILIATION_POLICY, driftBps },
      alert: notifyDiscord,
    },
  );
}

export async function isReconciliationRunning(): Promise<boolean> {
  return (await prismaReconciliationStore.findActiveRun(new Date(Date.now() - STALE_RUN_MS))) !== null;
}
