import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { deployments, releases } from "../db/schema";
import type { Actor } from "../auth/actor";
import { assertCapability } from "./authz";
import { recordAuditEvent } from "./audit";
import { generateId } from "../db/ids";
import { NotFoundError } from "../errors";

export type DeploymentRow = typeof deployments.$inferSelect;

export async function createDeployment(
  db: Db,
  actor: Actor,
  appId: string,
  input: { releaseId: string; environment: DeploymentRow["environment"] },
): Promise<DeploymentRow> {
  await assertCapability(db, actor, appId, "app.deployRelease");

  return db.transaction(async (tx) => {
    // Release id is confirmed to belong to this app before a deployment can
    // reference it — never trust a bare releaseId across app boundaries.
    const [release] = await tx
      .select()
      .from(releases)
      .where(and(eq(releases.id, input.releaseId), eq(releases.appId, appId)))
      .limit(1);
    if (!release) {
      throw new NotFoundError("Release", input.releaseId);
    }

    const [deployment] = await tx
      .insert(deployments)
      .values({
        id: generateId(),
        appId,
        releaseId: input.releaseId,
        environment: input.environment,
        status: "pending",
        deployedByPrincipalId: actor.principalId,
      })
      .returning();

    await recordAuditEvent(tx, {
      appId,
      actorPrincipalId: actor.principalId,
      action: "deployment.created",
      targetType: "deployment",
      targetId: deployment.id,
      metadata: { environment: input.environment },
    });

    return deployment;
  });
}

export async function listDeploymentsForActor(db: Db, actor: Actor, appId: string): Promise<DeploymentRow[]> {
  await assertCapability(db, actor, appId, "app.view");
  return db.select().from(deployments).where(eq(deployments.appId, appId));
}
