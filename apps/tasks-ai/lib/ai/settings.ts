import "server-only";
import { z } from "zod";
import type { RequestContext } from "../context";
import { authorize } from "../authz";
import { recordAudit } from "../events/emit";
import { PROVIDER_NAMES } from "./registry";

export const DEFAULT_AI_SETTINGS = {
  enabled: true,
  monthlyBudgetUsd: null as number | null,
  monthlyJobQuota: null as number | null,
  maxBlastRadius: 50,
  provider: "fixture",
  model: "fixture-1",
};

export async function getAiSettings(ctx: RequestContext) {
  const row = await ctx.db.aiSettings.findUnique({ where: { workspaceId: ctx.workspaceId } });
  return row ?? { workspaceId: ctx.workspaceId, ...DEFAULT_AI_SETTINGS };
}

const patchSchema = z
  .object({
    enabled: z.boolean(),
    monthlyBudgetUsd: z.number().nonnegative().nullable(),
    monthlyJobQuota: z.number().int().nonnegative().nullable(),
    maxBlastRadius: z.number().int().min(1).max(500),
    provider: z.enum(PROVIDER_NAMES),
    model: z.string().min(1).max(60),
  })
  .partial();

export async function updateAiSettings(ctx: RequestContext, input: unknown) {
  authorize(ctx.actor, "customfield.manage"); // admin+ (reuse the admin gate)
  const patch = patchSchema.parse(input);

  const updated = await ctx.db.aiSettings.upsert({
    where: { workspaceId: ctx.workspaceId },
    create: { workspaceId: ctx.workspaceId, ...DEFAULT_AI_SETTINGS, ...patch },
    update: patch,
  });

  if ("enabled" in patch) {
    await recordAudit(
      ctx.db,
      ctx.workspaceId,
      "ai.kill_switch_toggled",
      ctx.actor.membershipId,
      { enabled: patch.enabled },
      ctx.correlationId,
    );
  }
  return updated;
}
