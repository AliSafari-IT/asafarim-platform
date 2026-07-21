import type { Db } from "./client";
import { createApp } from "../repositories/apps";
import { applyOperation } from "../repositories/operations";
import { addCollaborator } from "../repositories/collaborators";

/**
 * Local-development / test fixtures: two owners, each with two apps, so
 * owner/app isolation is exercisable out of the box. Safe to rerun — every
 * write goes through the same idempotent repository methods used at
 * runtime, keyed on a fixed idempotency key per fixture row.
 */
export async function seedDatabase(db: Db) {
  const ownerA = { principalId: "seed-owner-a" };
  const ownerB = { principalId: "seed-owner-b" };

  const appA1 = await createApp(db, ownerA, { name: "Inventory Tracker", slug: "inventory-tracker" }, "seed-app-a1");
  const appA2 = await createApp(db, ownerA, { name: "Support Desk", slug: "support-desk" }, "seed-app-a2");
  const appB1 = await createApp(db, ownerB, { name: "Field Reports", slug: "field-reports" }, "seed-app-b1");
  const appB2 = await createApp(db, ownerB, { name: "Asset Registry", slug: "asset-registry" }, "seed-app-b2");

  await applyOperation(db, ownerA, appA1.id, {
    operationType: "add-entity",
    payload: { entity: "Item", fields: [{ name: "name", type: "string" }] },
    idempotencyKey: "seed-app-a1-op1",
  });

  await addCollaborator(db, ownerB, appB1.id, "seed-collaborator-1", "editor");

  return { owners: [ownerA, ownerB], apps: [appA1, appA2, appB1, appB2] };
}
