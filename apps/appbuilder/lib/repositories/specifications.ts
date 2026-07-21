import { and, asc, eq } from "drizzle-orm";
import {
  diffSpecifications,
  type ApplicationSpecificationType,
  type SpecificationDiff,
} from "@asafarim/appbuilder-schema";
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

/** Immutable version history, oldest first. */
export async function listVersionsForActor(
  db: Db,
  actor: Actor,
  appId: string,
): Promise<SpecificationVersionRow[]> {
  // appId is denormalized onto specificationVersions specifically so this
  // scoped read doesn't need a join through specifications.
  await assertCapability(db, actor, appId, "app.view");
  return db
    .select()
    .from(specificationVersions)
    .where(eq(specificationVersions.appId, appId))
    .orderBy(asc(specificationVersions.versionNumber));
}

/** A single immutable version, by its version number. */
export async function getVersionForActor(
  db: Db,
  actor: Actor,
  appId: string,
  versionNumber: number,
): Promise<SpecificationVersionRow> {
  await assertCapability(db, actor, appId, "app.view");

  const [version] = await db
    .select()
    .from(specificationVersions)
    .where(and(eq(specificationVersions.appId, appId), eq(specificationVersions.versionNumber, versionNumber)))
    .limit(1);
  if (!version) {
    throw new NotFoundError("Specification version", String(versionNumber));
  }
  return version;
}

/** Structured, path-aware diff between two immutable versions of the same app. */
export async function compareVersionsForActor(
  db: Db,
  actor: Actor,
  appId: string,
  fromVersionNumber: number,
  toVersionNumber: number,
): Promise<SpecificationDiff> {
  const [from, to] = await Promise.all([
    getVersionForActor(db, actor, appId, fromVersionNumber),
    getVersionForActor(db, actor, appId, toVersionNumber),
  ]);
  return diffSpecifications(
    from.payload as unknown as ApplicationSpecificationType,
    to.payload as unknown as ApplicationSpecificationType,
  );
}
