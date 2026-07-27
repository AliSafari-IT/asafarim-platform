import { eq } from "drizzle-orm";
import { REGISTRY_VERSION, resolveHomePage } from "@asafarim/appbuilder-runtime";
import type { ApplicationSpecificationType } from "@asafarim/appbuilder-schema";
import { checksumOf as canonicalChecksumOf } from "@asafarim/appbuilder-schema";
import type { Db } from "../db/client";
import { appDomains, deployments, releases, specificationVersions } from "../db/schema";
import { generateId } from "../db/ids";
import { recordAuditEvent } from "../repositories/audit";
import {
  heartbeat,
  isCancellationRequested,
  recordDeploymentStep,
  releaseLease,
  transitionPhase,
  transitionStatus,
  type DeploymentRow,
} from "../repositories/deployments";
import { RESERVED_APP_SLUGS } from "../routing/resolveAppHost";
import { checkReleaseEligibility } from "./eligibility";
import { DeploymentLeaseLostError } from "./errors";
import { DEPLOYMENT_LIMITS } from "./limits";
import type { DeploymentPhase } from "./stateMachine";

/**
 * Drives one deployment (or rollback) from `pending`/`running` through to a
 * terminal status — the durable worker job the issue requires. Mirrors
 * lib/validation/pipeline.ts's shape exactly: heartbeat before every phase,
 * cooperative cancellation checked before every PRE-ACTIVATION phase (never
 * after — cancellation is refused once the pointer has moved, per
 * lib/repositories/deployments.ts#requestDeploymentCancellation), and a
 * lease-lost outcome that lets the worker's crash-recovery sweep reclaim and
 * resume this exact deployment from wherever its persisted `phase` left off.
 *
 * There is no separate "artifact" to build or push anywhere: a generated
 * app is served entirely by the shared metadata runtime reading an
 * immutable, already-persisted specification version — "publishing" and
 * "preparing the artifact" are therefore verification steps (registry
 * compatibility, manifest integrity), never a build/push side effect.
 */

export interface DeploymentPipelineDeps {
  db: Db;
  workerId: string;
  leaseDurationMs: number;
  signal: AbortSignal;
  /**
   * Injectable for tests. Defaults to a real HTTP request against this
   * app's own internal origin with the target production `Host` header set
   * — exactly how Caddy's wildcard block routes a real request, without
   * this worker needing live DNS/TLS to verify its own activation.
   */
  verifyProductionRoute?: (host: string) => Promise<{ ok: boolean; status?: number; message: string }>;
}

export type DeploymentPipelineOutcome =
  | { kind: "completed"; deployment: DeploymentRow }
  | { kind: "lease_lost" }
  /** An infrastructure-classified failure (an unexpected exception, never a business-logic rejection like ineligibility or a genuine health-check failure) with retries remaining — the lease was released so a nudge-with-backoff or the next sweep can re-attempt the SAME phase. */
  | { kind: "retry_later"; deployment: DeploymentRow };

async function defaultVerifyProductionRoute(host: string): Promise<{ ok: boolean; status?: number; message: string }> {
  const origin = process.env.APPBUILDER_INTERNAL_ORIGIN ?? "http://127.0.0.1:3000";
  try {
    const response = await fetch(origin, { headers: { Host: host }, signal: AbortSignal.timeout(10_000), redirect: "manual" });
    // Any non-5xx response means the app server itself is up and routing
    // this host correctly — a 200 (rendered), a redirect to sign-in (an
    // unauthenticated probe correctly gated), or a 404 (the request landed
    // but a page didn't resolve) are all "the route is alive"; only a
    // server error or a network failure means activation didn't actually
    // take effect.
    const ok = response.status < 500;
    return { ok, status: response.status, message: `Internal request to "${host}" returned HTTP ${response.status}.` };
  } catch (err) {
    return { ok: false, message: `Internal request to "${host}" failed: ${err instanceof Error ? err.message : "unknown error"}.` };
  }
}

async function reloadDeployment(db: Db, deploymentId: string): Promise<DeploymentRow | null> {
  const [row] = await db.select().from(deployments).where(eq(deployments.id, deploymentId)).limit(1);
  return row ?? null;
}

/** Structural, in-process sanity check that a specification renders a reachable home page with at least one role/permission defined — the closest thing to a "health check" a shared-runtime app has, since there is no per-app process to probe. */
function checkSpecRenders(spec: ApplicationSpecificationType): { ok: boolean; message: string } {
  const home = resolveHomePage(spec);
  if (!home) return { ok: false, message: "Specification has no reachable, non-archived page to serve as the home page." };
  if (spec.roles.length === 0) return { ok: false, message: "Specification defines no roles — RBAC could never grant any access." };
  return { ok: true, message: `Home page "${home.name}" resolves; ${spec.roles.length} role(s) defined.` };
}

export async function runDeploymentJob(deps: DeploymentPipelineDeps, initialDeployment: DeploymentRow): Promise<DeploymentPipelineOutcome> {
  let deployment = initialDeployment;
  const verifyProductionRoute = deps.verifyProductionRoute ?? defaultVerifyProductionRoute;

  const bumpHeartbeat = async (): Promise<"ok" | "lease_lost"> => {
    try {
      await heartbeat(deps.db, deployment.id, deps.workerId, deps.leaseDurationMs);
      return "ok";
    } catch (err) {
      if (err instanceof DeploymentLeaseLostError) return "lease_lost";
      throw err;
    }
  };

  if (deps.signal.aborted || (isCancellationRequested(deployment) && !deployment.activatedAt)) {
    deployment = await transitionStatus(deps.db, deployment.id, deployment.status as "pending" | "running", "cancelled");
    return { kind: "completed", deployment };
  }

  if ((await bumpHeartbeat()) === "lease_lost") return { kind: "lease_lost" };

  if (deployment.status === "pending") {
    deployment = await transitionStatus(deps.db, deployment.id, "pending", "running");
    await recordAuditEvent(deps.db, {
      appId: deployment.appId,
      actorPrincipalId: deployment.deployedByPrincipalId,
      action: deployment.isRollback ? "deployment.rollback_started" : "deployment.started",
      targetType: "deployment",
      targetId: deployment.id,
      metadata: { releaseId: deployment.releaseId },
    });
  }

  const [release] = await deps.db.select().from(releases).where(eq(releases.id, deployment.releaseId)).limit(1);
  if (!release) throw new Error(`Release ${deployment.releaseId} not found while running deployment ${deployment.id}`);

  const [specVersion] = await deps.db.select().from(specificationVersions).where(eq(specificationVersions.id, release.specificationVersionId)).limit(1);
  if (!specVersion) throw new Error(`Specification version ${release.specificationVersionId} not found while running deployment ${deployment.id}`);
  const spec = specVersion.payload as unknown as ApplicationSpecificationType;

  /** Runs one pre-activation phase: checks cancellation, heartbeats, records the step, and either advances the phase or fails the whole deployment (leaving production untouched). Returns `null` to signal the caller should stop (deployment finalized as failed/cancelled/lease-lost). */
  async function runPreActivationPhase(
    phase: DeploymentPhase,
    fn: () => Promise<{ ok: boolean; message: string; detail?: Record<string, unknown>; failureCode?: DeploymentRow["failureCode"] }>,
  ): Promise<"advanced" | "stopped" | "retry_later"> {
    const fresh = await reloadDeployment(deps.db, deployment.id);
    if (!fresh) return "stopped";
    deployment = fresh;

    if (deps.signal.aborted || (isCancellationRequested(deployment) && !deployment.activatedAt)) {
      deployment = await transitionStatus(deps.db, deployment.id, "running", "cancelled");
      return "stopped";
    }
    if ((await bumpHeartbeat()) === "lease_lost") return "stopped";

    const startedAt = new Date();
    let result: { ok: boolean; message: string; detail?: Record<string, unknown>; failureCode?: DeploymentRow["failureCode"] };
    try {
      result = await fn();
    } catch (err) {
      result = { ok: false, message: err instanceof Error ? err.message : "Unexpected error.", failureCode: "worker_infrastructure_error" };
    }
    const durationMs = Date.now() - startedAt.getTime();

    await recordDeploymentStep(deps.db, {
      deploymentId: deployment.id,
      appId: deployment.appId,
      phase,
      ok: result.ok,
      message: result.message,
      detail: result.detail,
      durationMs,
    });

    if (!result.ok) {
      const failureCode = result.failureCode ?? "worker_infrastructure_error";
      // Only an INFRASTRUCTURE-classified failure (an unexpected exception —
      // never a deterministic business rejection like ineligibility, a
      // reserved slug, or a genuine health/smoke-test failure, all of which
      // would fail identically on retry) is ever retried automatically —
      // issue requirement "retry and bounded backoff", scoped narrowly.
      if (failureCode === "worker_infrastructure_error" && deployment.attemptCount < DEPLOYMENT_LIMITS.MAX_DEPLOYMENT_ATTEMPTS) {
        await releaseLease(deps.db, deployment.id, deps.workerId);
        return "retry_later";
      }

      deployment = await transitionStatus(deps.db, deployment.id, "running", "failed", {
        failureCode,
        failureMessage: result.message,
      });
      await recordAuditEvent(deps.db, {
        appId: deployment.appId,
        actorPrincipalId: deployment.deployedByPrincipalId,
        action: "deployment.failed",
        targetType: "deployment",
        targetId: deployment.id,
        metadata: { phase, failureCode },
      });
      return "stopped";
    }

    const nextIndex = PRE_ACTIVATION_PHASES.indexOf(phase) + 1;
    const nextPhase = PRE_ACTIVATION_PHASES[nextIndex] ?? "activating";
    deployment = await transitionPhase(deps.db, deployment.id, phase, nextPhase);
    return "advanced";
  }

  const PRE_ACTIVATION_PHASES: readonly DeploymentPhase[] = [
    "queued",
    "checking_eligibility",
    "freezing_manifest",
    "reserving_slug",
    "checking_data_compatibility",
    "preparing_artifact",
    "publishing",
    "health_checking",
    "smoke_testing",
  ];

  if (deployment.phase === "queued") {
    const outcome = await runPreActivationPhase("queued", async () => ({ ok: true, message: "Deployment claimed." }));
    if (outcome === "retry_later") return { kind: "retry_later", deployment };
    if (outcome === "stopped") return finalize(deployment);
  }

  if (deployment.phase === "checking_eligibility") {
    const outcome = await runPreActivationPhase("checking_eligibility", async () => {
      if (deployment.isRollback) {
        if (!release.publishedAt) return { ok: false, message: "Rollback target has never been published.", failureCode: "not_eligible" };
        return { ok: true, message: "Rollback target was previously published — eligibility re-check skipped for rollback." };
      }
      const eligibility = await checkReleaseEligibility(deps.db, deployment.appId, release.specificationVersionId);
      if (!eligibility.eligible) {
        return { ok: false, message: `No longer eligible: ${eligibility.reasons.join("; ")}`, failureCode: "not_eligible", detail: { reasons: eligibility.reasons } };
      }
      return { ok: true, message: "Release eligibility reconfirmed." };
    });
    if (outcome === "retry_later") return { kind: "retry_later", deployment };
    if (outcome === "stopped") return finalize(deployment);
  }

  if (deployment.phase === "freezing_manifest") {
    const outcome = await runPreActivationPhase("freezing_manifest", async () => {
      const recomputed = canonicalChecksumOf(release.manifest);
      if (recomputed !== release.manifestChecksum) {
        return { ok: false, message: "Frozen manifest failed integrity verification (checksum mismatch).", failureCode: "not_eligible" };
      }
      return { ok: true, message: "Manifest checksum verified byte-identical to the one approved." };
    });
    if (outcome === "retry_later") return { kind: "retry_later", deployment };
    if (outcome === "stopped") return finalize(deployment);
  }

  if (deployment.phase === "reserving_slug") {
    const outcome = await runPreActivationPhase("reserving_slug", async () => {
      const slug = release.appSlug;
      if (RESERVED_APP_SLUGS.has(slug)) {
        return { ok: false, message: `"${slug}" is a reserved platform name and can never be used as a managed-app slug.`, failureCode: "slug_reserved" };
      }
      const [existingDomain] = await deps.db
        .select()
        .from(appDomains)
        .where(eq(appDomains.appId, deployment.appId))
        .limit(1);
      if (existingDomain) {
        if (existingDomain.host !== release.productionHost) {
          return {
            ok: false,
            message: `This app's reserved production host ("${existingDomain.host}") no longer matches this release's slug ("${release.productionHost}") — a slug change is an explicit, separately reviewed operation, never applied automatically by a deployment.`,
            failureCode: "slug_unavailable",
          };
        }
        return { ok: true, message: `Existing managed domain "${existingDomain.host}" reused.` };
      }
      try {
        await deps.db.insert(appDomains).values({
          id: generateId(),
          appId: deployment.appId,
          host: release.productionHost,
          kind: "auto_slug",
          status: "reserved",
          reservedByPrincipalId: deployment.deployedByPrincipalId,
        });
      } catch {
        return { ok: false, message: `Could not reserve "${release.productionHost}" — it is already claimed by another app.`, failureCode: "slug_unavailable" };
      }
      return { ok: true, message: `Reserved managed domain "${release.productionHost}".` };
    });
    if (outcome === "retry_later") return { kind: "retry_later", deployment };
    if (outcome === "stopped") return finalize(deployment);
  }

  if (deployment.phase === "checking_data_compatibility") {
    const outcome = await runPreActivationPhase("checking_data_compatibility", async () => {
      if (release.dataCompatibility === "unsafe") {
        return { ok: false, message: "This release's generated-data schema compatibility is unsafe.", failureCode: "data_incompatible" };
      }
      return { ok: true, message: `Generated-data compatibility verdict: "${release.dataCompatibility}".` };
    });
    if (outcome === "retry_later") return { kind: "retry_later", deployment };
    if (outcome === "stopped") return finalize(deployment);
  }

  if (deployment.phase === "preparing_artifact") {
    const outcome = await runPreActivationPhase("preparing_artifact", async () => {
      if (release.registryVersion !== REGISTRY_VERSION) {
        return {
          ok: false,
          message: `Release was built against registry version "${release.registryVersion}", but the running registry is "${REGISTRY_VERSION}".`,
          failureCode: "artifact_preparation_failed",
        };
      }
      return { ok: true, message: "No separate build artifact is required — the metadata runtime reads this release's pinned specification directly once activated." };
    });
    if (outcome === "retry_later") return { kind: "retry_later", deployment };
    if (outcome === "stopped") return finalize(deployment);
  }

  if (deployment.phase === "publishing") {
    const outcome = await runPreActivationPhase("publishing", async () => ({
      ok: true,
      message: "Nothing to push — a managed app has no per-app container or repository; publication happens by activating the domain pointer.",
    }));
    if (outcome === "retry_later") return { kind: "retry_later", deployment };
    if (outcome === "stopped") return finalize(deployment);
  }

  if (deployment.phase === "health_checking") {
    const outcome = await runPreActivationPhase("health_checking", async () => {
      const check = checkSpecRenders(spec);
      return { ok: check.ok, message: check.message, failureCode: check.ok ? undefined : "health_check_failed" };
    });
    if (outcome === "retry_later") return { kind: "retry_later", deployment };
    if (outcome === "stopped") return finalize(deployment);
  }

  if (deployment.phase === "smoke_testing") {
    const outcome = await runPreActivationPhase("smoke_testing", async () => {
      const home = resolveHomePage(spec);
      if (!home) return { ok: false, message: "No home page resolves for a pre-activation smoke test.", failureCode: "smoke_test_failed" };
      return { ok: true, message: `Smoke test resolved home page "${home.name}" at path "/${home.path}".` };
    });
    if (outcome === "retry_later") return { kind: "retry_later", deployment };
    if (outcome === "stopped") return finalize(deployment);
  }

  if (deployment.phase === "activating") {
    if ((await bumpHeartbeat()) === "lease_lost") return { kind: "lease_lost" };
    const startedAt = new Date();
    let activationOk = true;
    let activationMessage = "";
    try {
      await deps.db.transaction(async (tx) => {
        const [domain] = await tx
          .select()
          .from(appDomains)
          .where(eq(appDomains.appId, deployment.appId))
          .limit(1);
        if (!domain || domain.host !== release.productionHost) {
          throw new Error("Reserved domain no longer matches this release's production host.");
        }

        const now = new Date();
        const [activatedDomain] = await tx
          .update(appDomains)
          .set({ status: "active", activeReleaseId: release.id, activatedAt: now, updatedAt: now })
          .where(eq(appDomains.id, domain.id))
          .returning();
        if (!activatedDomain) throw new Error("Failed to atomically activate the production domain pointer.");

        if (deployment.supersededReleaseId) {
          await tx.update(releases).set({ status: "superseded" }).where(eq(releases.id, deployment.supersededReleaseId));
        }
        const [publishedRelease] = await tx
          .update(releases)
          .set({ status: "published", publishedByPrincipalId: deployment.deployedByPrincipalId, publishedAt: now, previousReleaseId: deployment.supersededReleaseId })
          .where(eq(releases.id, release.id))
          .returning();
        if (!publishedRelease) throw new Error("Failed to mark the release published.");

        const [updatedDeployment] = await tx
          .update(deployments)
          .set({ phase: "verifying", activatedAt: now, updatedAt: now })
          .where(eq(deployments.id, deployment.id))
          .returning();
        if (!updatedDeployment) throw new Error("Failed to record deployment activation.");
        deployment = updatedDeployment;
      });
      activationMessage = `Activated "${release.productionHost}" → release ${release.id}.`;
    } catch (err) {
      activationOk = false;
      activationMessage = err instanceof Error ? err.message : "Activation failed.";
    }

    await recordDeploymentStep(deps.db, {
      deploymentId: deployment.id,
      appId: deployment.appId,
      phase: "activating",
      ok: activationOk,
      message: activationMessage,
      durationMs: Date.now() - startedAt.getTime(),
    });

    if (!activationOk) {
      deployment = await transitionStatus(deps.db, deployment.id, "running", "failed", { failureCode: "activation_failed", failureMessage: activationMessage });
      await recordAuditEvent(deps.db, {
        appId: deployment.appId,
        actorPrincipalId: deployment.deployedByPrincipalId,
        action: "deployment.failed",
        targetType: "deployment",
        targetId: deployment.id,
        metadata: { phase: "activating" },
      });
      return finalize(deployment);
    }

    await recordAuditEvent(deps.db, {
      appId: deployment.appId,
      actorPrincipalId: deployment.deployedByPrincipalId,
      action: "deployment.activated",
      targetType: "deployment",
      targetId: deployment.id,
      metadata: { releaseId: release.id, host: release.productionHost },
    });
  }

  if (deployment.phase === "verifying") {
    if ((await bumpHeartbeat()) === "lease_lost") return { kind: "lease_lost" };
    const startedAt = new Date();
    const verification = await verifyProductionRoute(release.productionHost);
    await recordDeploymentStep(deps.db, {
      deploymentId: deployment.id,
      appId: deployment.appId,
      phase: "verifying",
      ok: verification.ok,
      message: verification.message,
      detail: { status: verification.status ?? null },
      durationMs: Date.now() - startedAt.getTime(),
    });

    if (!verification.ok) {
      await restorePreviousPointer(deps.db, deployment, release);
      deployment = await transitionStatus(deps.db, deployment.id, "running", "failed", {
        failureCode: "post_activation_verification_failed",
        failureMessage: verification.message,
      });
      await recordAuditEvent(deps.db, {
        appId: deployment.appId,
        actorPrincipalId: deployment.deployedByPrincipalId,
        action: "deployment.post_activation_rollback",
        targetType: "deployment",
        targetId: deployment.id,
        metadata: { restoredReleaseId: deployment.supersededReleaseId },
      });
      return finalize(deployment);
    }

    deployment = await transitionPhase(deps.db, deployment.id, "verifying", "completed");
  }

  if (deployment.phase === "completed" && deployment.status === "running") {
    deployment = await transitionStatus(deps.db, deployment.id, "running", "succeeded");
    await recordAuditEvent(deps.db, {
      appId: deployment.appId,
      actorPrincipalId: deployment.deployedByPrincipalId,
      action: deployment.isRollback ? "deployment.rollback_succeeded" : "deployment.succeeded",
      targetType: "deployment",
      targetId: deployment.id,
      metadata: { releaseId: release.id, host: release.productionHost },
    });
  }

  return finalize(deployment);
}

function finalize(deployment: DeploymentRow): DeploymentPipelineOutcome {
  return { kind: "completed", deployment };
}

/**
 * If post-activation verification fails, restore the previous healthy
 * pointer when safe — atomically, in one transaction, exactly mirroring the
 * activation transaction it undoes. The just-activated release is marked
 * `archived` (no longer casually rollback-eligible without review) while
 * the restored release goes back to `published`.
 */
async function restorePreviousPointer(db: Db, deployment: DeploymentRow, badRelease: typeof releases.$inferSelect): Promise<void> {
  await db.transaction(async (tx) => {
    const [domain] = await tx.select().from(appDomains).where(eq(appDomains.appId, deployment.appId)).limit(1);
    if (!domain) return;

    if (deployment.supersededReleaseId) {
      await tx
        .update(appDomains)
        .set({ activeReleaseId: deployment.supersededReleaseId, updatedAt: new Date() })
        .where(eq(appDomains.id, domain.id));
      await tx.update(releases).set({ status: "published" }).where(eq(releases.id, deployment.supersededReleaseId));
    } else {
      // No prior production release existed — the safe restore is to
      // deactivate the domain entirely rather than leave a broken pointer.
      await tx
        .update(appDomains)
        .set({ status: "reserved", activeReleaseId: null, updatedAt: new Date() })
        .where(eq(appDomains.id, domain.id));
    }

    await tx.update(releases).set({ status: "archived" }).where(eq(releases.id, badRelease.id));
  });
}
