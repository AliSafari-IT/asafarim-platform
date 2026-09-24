"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ROLES, hasPermission, requireRole } from "@asafarim/auth";
import { writeAuditEvent } from "../../../lib/audit";
import {
  DEFAULT_WINDOW_DAYS,
  isReconciliationRunning,
  startReconciliation,
} from "../../../lib/server/ai-cost-reconciliation";

const ALLOWED_DAYS = new Set([7, 14, 31]);

/**
 * Start a manual reconciliation run (#592). Requires ai_costs.reconcile —
 * the run calls provider cost APIs with the platform's admin keys, so it
 * is a deliberate grant, not part of the default Admin role. The job runs
 * after the response; the page shows it as "running" until it finishes.
 */
export async function runAiCostReconciliation(formData: FormData): Promise<void> {
  const session = await requireRole([ROLES.ADMIN]);
  if (!(await hasPermission(session, "ai_costs.reconcile"))) redirect("/denied");

  const requested = Number(formData.get("days"));
  const days = ALLOWED_DAYS.has(requested) ? requested : DEFAULT_WINDOW_DAYS;

  if (await isReconciliationRunning()) redirect(`/ai-costs?days=${days}&notice=running`);

  await writeAuditEvent({
    userId: session.user.id,
    action: "ai_costs.reconciliation.requested",
    entity: "AiCostReconciliation",
    entityId: null,
    changes: { days },
  });

  after(async () => {
    await startReconciliation({ trigger: "manual", triggeredBy: session.user.id, days });
  });

  revalidatePath("/ai-costs");
  redirect(`/ai-costs?days=${days}&notice=started`);
}
