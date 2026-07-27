import { randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { customDomainRequests } from "../db/schema";
import type { Actor } from "../auth/actor";
import { assertCapability } from "../repositories/authz";
import { recordAuditEvent } from "../repositories/audit";
import { generateId } from "../db/ids";
import { ConflictError, NotFoundError } from "../errors";
import { isCustomDomainsEnabled } from "./featureFlag";

export type CustomDomainRequestRow = typeof customDomainRequests.$inferSelect;

export class CustomDomainsDisabledError extends ConflictError {
  constructor() {
    super(
      "Custom domains are not enabled on this platform yet. This request is recorded as readiness data only — no DNS, TLS, or routing change occurs."
    );
    this.name = "CustomDomainsDisabledError";
  }
}

const HOST_RE =
  /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

function normalizeHost(host: string): string {
  return host.trim().toLowerCase();
}

/**
 * Records a custom-domain READINESS request — never provisions DNS, issues
 * a TLS certificate, or changes routing (see lib/customDomains/featureFlag.ts
 * and docs/appbuilder-m12-custom-domain-readiness.md). Always inserts the
 * row (so the readiness flow — ownership verification instructions, TLS
 * lifecycle tracking — can be built and demoed against real data) but
 * refuses with `CustomDomainsDisabledError` when the platform-wide flag is
 * off, UNLESS the caller explicitly acknowledges this is readiness-only via
 * `input.acknowledgeNotEnabled` — matching "prepare but do not enable" from
 * the issue: the UI can still let an owner queue up a request today, with
 * the disabled state stated up front, rather than blocking the whole
 * feature from being exercised until a future milestone flips the flag.
 */
export interface CreateCustomDomainRequestInput {
  requestedHost: string;
  acknowledgeNotEnabled: boolean;
}

export async function createCustomDomainRequest(
  db: Db,
  actor: Actor,
  appId: string,
  input: CreateCustomDomainRequestInput
): Promise<CustomDomainRequestRow> {
  await assertCapability(db, actor, appId, "app.manageCustomDomainRequest");

  const host = normalizeHost(input.requestedHost);
  if (!HOST_RE.test(host)) {
    throw new ConflictError(
      `"${input.requestedHost}" is not a valid domain name.`
    );
  }
  if (!isCustomDomainsEnabled() && !input.acknowledgeNotEnabled) {
    throw new CustomDomainsDisabledError();
  }

  return db.transaction(async (tx) => {
    const [existingActive] = await tx
      .select()
      .from(customDomainRequests)
      .where(
        and(
          eq(customDomainRequests.appId, appId),
          eq(customDomainRequests.status, "pending_verification")
        )
      )
      .limit(1);
    if (existingActive) {
      throw new ConflictError(
        "This app already has a pending custom-domain request. Cancel it before requesting a different host."
      );
    }

    // Collision prevention: the DB-level unique index on `requested_host`
    // is the actual guard (see schema.ts) — this pre-check exists only to
    // return a friendlier error than a raw constraint violation.
    const [hostTaken] = await tx
      .select()
      .from(customDomainRequests)
      .where(eq(customDomainRequests.requestedHost, host))
      .limit(1);
    if (hostTaken && hostTaken.status !== "cancelled") {
      throw new ConflictError(
        `"${host}" is already requested or verified by another app.`
      );
    }

    const verificationToken = `asafarim-verify-${randomBytes(16).toString("hex")}`;

    const [row] = await tx
      .insert(customDomainRequests)
      .values({
        id: generateId(),
        appId,
        requestedHost: host,
        verificationToken,
        requestedByPrincipalId: actor.principalId,
      })
      .returning();

    await recordAuditEvent(tx, {
      appId,
      actorPrincipalId: actor.principalId,
      action: "custom_domain.requested",
      targetType: "custom_domain_request",
      targetId: row.id,
      metadata: {
        requestedHost: host,
        platformEnabled: isCustomDomainsEnabled(),
      },
    });

    return row;
  });
}

export async function cancelCustomDomainRequest(
  db: Db,
  actor: Actor,
  appId: string,
  requestId: string
): Promise<CustomDomainRequestRow> {
  await assertCapability(db, actor, appId, "app.manageCustomDomainRequest");

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(customDomainRequests)
      .where(
        and(
          eq(customDomainRequests.id, requestId),
          eq(customDomainRequests.appId, appId)
        )
      )
      .limit(1);
    if (!existing) throw new NotFoundError("CustomDomainRequest", requestId);
    if (existing.status === "cancelled") return existing;

    const [row] = await tx
      .update(customDomainRequests)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(customDomainRequests.id, requestId))
      .returning();

    await recordAuditEvent(tx, {
      appId,
      actorPrincipalId: actor.principalId,
      action: "custom_domain.cancelled",
      targetType: "custom_domain_request",
      targetId: requestId,
      metadata: {},
    });

    return row;
  });
}

export async function getCustomDomainRequestForActor(
  db: Db,
  actor: Actor,
  appId: string
): Promise<CustomDomainRequestRow | null> {
  await assertCapability(db, actor, appId, "app.viewOperations");
  const [row] = await db
    .select()
    .from(customDomainRequests)
    .where(eq(customDomainRequests.appId, appId))
    .orderBy(desc(customDomainRequests.createdAt))
    .limit(1);
  return row ?? null;
}
