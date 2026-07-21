import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { specifications, specificationVersions } from "../db/schema";
import type { Actor } from "../auth/actor";
import { assertCapability } from "./authz";
import { NotFoundError } from "../errors";

export type SpecificationRow = typeof specifications.$inferSelect;
export type SpecificationVersionRow = typeof specificationVersions.$inferSelect;

export async function getSpecificationForActor(
  db: Db,
  actor: Actor,
  appId: string,
): Promise<SpecificationRow> {
  await assertCapability(db, actor, appId, "app.view");

  const [spec] = await db.select().from(specifications).where(eq(specifications.appId, appId)).limit(1);
  if (!spec) {
    throw new NotFoundError("Specification for app", appId);
  }
  return spec;
}

export async function getLatestVersionForActor(
  db: Db,
  actor: Actor,
  appId: string,
): Promise<SpecificationVersionRow | undefined> {
  const spec = await getSpecificationForActor(db, actor, appId);
  if (spec.currentVersionNumber === 0) return undefined;

  const [version] = await db
    .select()
    .from(specificationVersions)
    .where(
      and(
        eq(specificationVersions.specificationId, spec.id),
        eq(specificationVersions.versionNumber, spec.currentVersionNumber),
      ),
    )
    .limit(1);

  return version;
}

export async function listVersionsForActor(
  db: Db,
  actor: Actor,
  appId: string,
): Promise<SpecificationVersionRow[]> {
  // appId is denormalized onto specificationVersions specifically so this
  // scoped read doesn't need a join through specifications.
  await assertCapability(db, actor, appId, "app.view");
  return db.select().from(specificationVersions).where(eq(specificationVersions.appId, appId));
}
