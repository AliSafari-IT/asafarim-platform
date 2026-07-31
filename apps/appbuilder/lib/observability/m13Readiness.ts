import { and, eq, inArray, lt, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { conversationAttachments, validationArtifacts } from "../db/schema";
import { EXTRACTION_VERSION } from "../attachments/extract";
import { ALLOWED_ATTACHMENT_MIME_TYPES } from "../attachments/limits";
import { ScannerNotConfiguredError, resolveScanAdapter } from "../attachments/scan";
import { REFERENCE_LIMITS } from "../references/limits";
import { describeFeatureFlags, isUrlImportsEnabled, isVisionEnabled, type FeatureFlagState } from "../features/flags";
import { EVALUATION_VERSION } from "../../eval/releaseGates";
import type { ReadinessStatus } from "./status";
import type { EnvLike } from "../features/env";

/**
 * M13 slice G readiness sections: "Readiness reports storage, extraction
 * worker, scanner, provider modalities, URL import, cleanup lag, and
 * evaluation version. **Unconfigured dependencies must not report healthy.**"
 * (docs/appbuilder-m13-multimodal-contextual-assistant.md.)
 *
 * That bolded sentence is the whole design constraint, and it is stricter
 * than it first sounds. Two things follow from it that this module does
 * deliberately:
 *
 * - **Nothing here probes anything.** No test upload, no outbound fetch, no
 *   model call. Every section is derived from configuration this process can
 *   read plus rows already in the database. A readiness endpoint that made
 *   an outbound request would itself be an SSRF surface (the same reasoning
 *   slice F applied to `referenceImport`), and one that wrote a test object
 *   would make "check readiness" a mutation.
 *
 * - **"Off on purpose" and "broken" are different statuses.** A feature
 *   switched off by its flag reports `not_configured`, never `unhealthy`:
 *   an operator who disabled vision does not need a red light every minute
 *   telling them so. A feature switched ON whose dependency is missing —
 *   vision enabled with no vision-capable provider, attachments accepted
 *   with no real scanner in production — reports `unhealthy`, because that
 *   combination is a genuine misconfiguration serving users badly right now.
 */

export interface M13ReadinessSection {
  status: ReadinessStatus;
  /** One line an operator can act on. Never a stack trace or a config value. */
  summary: string;
  detail: Record<string, unknown>;
}

// ─── Storage ──────────────────────────────────────────────────────────────

/**
 * Attachments are written through `@asafarim/storage`, which silently falls
 * back to a LOCAL FILESYSTEM driver outside production when no bucket is
 * configured. That fallback is correct for development and actively wrong
 * for a deployed instance: local disk is not shared between containers and
 * does not survive a redeploy, so an attachment uploaded before a deploy is
 * simply gone after it. Production with no remote bucket is therefore
 * `unhealthy`, not `not_configured` — files are being accepted and will be
 * lost.
 */
export function checkStorageReadiness(
  env: EnvLike = process.env
): M13ReadinessSection {
  const driver = (env.STORAGE_DRIVER ?? "").trim().toLowerCase();
  const forceRemote = ["1", "true", "yes", "on"].includes(
    (env.STORAGE_FORCE_REMOTE ?? env.DO_SPACES_FORCE_REMOTE ?? "").trim().toLowerCase()
  );
  const remoteRequested = forceRemote || driver === "spaces" || driver === "s3";
  const bucket = env.STORAGE_BUCKET ?? env.DO_SPACES_BUCKET_NAME ?? env.DO_SPACES_BUCKET;
  const endpoint = env.STORAGE_ENDPOINT ?? env.DO_SPACES_ENDPOINT;
  const hasCredentials = Boolean(
    (env.STORAGE_ACCESS_KEY ?? env.DO_SPACES_ACCESS_KEY_ID ?? env.DO_SPACES_KEY) &&
      (env.STORAGE_SECRET_KEY ?? env.DO_SPACES_SECRET_ACCESS_KEY ?? env.DO_SPACES_SECRET)
  );
  const isProduction = env.NODE_ENV === "production";
  const remoteConfigured = Boolean(endpoint && bucket && hasCredentials);

  // Credentials themselves are never echoed — only whether both halves are
  // present, which is the only part an operator needs from here.
  const detail = {
    driver: driver || (remoteConfigured ? "s3 (inferred)" : "local"),
    remoteConfigured,
    bucketConfigured: Boolean(bucket),
    endpointConfigured: Boolean(endpoint),
    credentialsConfigured: hasCredentials,
    environment: isProduction ? "production" : "non-production",
  };

  if (driver === "local" && isProduction) {
    return {
      status: "unhealthy",
      summary:
        "STORAGE_DRIVER is explicitly `local` in production — attachments are written to container-local disk and will be lost on redeploy.",
      detail,
    };
  }
  if (isProduction && !remoteConfigured) {
    return {
      status: "unhealthy",
      summary:
        "No remote object storage is configured in production. Attachment uploads land on container-local disk and will not survive a redeploy.",
      detail,
    };
  }
  if (remoteRequested && !remoteConfigured) {
    return {
      status: "unhealthy",
      summary:
        "Remote storage is requested but endpoint, bucket, and credentials are not all set — every attachment upload will fail.",
      detail,
    };
  }
  if (!remoteConfigured) {
    return {
      status: "not_configured",
      summary:
        "Using the local-filesystem storage driver (expected outside production). Attachments do not persist across redeploys.",
      detail,
    };
  }
  return {
    status: "healthy",
    summary: "Remote object storage is configured for attachment content.",
    detail,
  };
}

// ─── Extraction ───────────────────────────────────────────────────────────

/**
 * Extraction runs in-process at commit (lib/attachments/process.ts), so
 * there is no worker to be up or down — the honest signal is *coverage*:
 * which of the accepted types actually yield text. Images and PDFs are
 * accepted and yield none, which is a documented deferral rather than a
 * fault, so this reports `degraded` with the gap named rather than `healthy`
 * (which would hide a real limitation) or `unhealthy` (which would imply
 * something is broken).
 */
export async function checkExtractionReadiness(
  db: Db,
  appId: string
): Promise<M13ReadinessSection> {
  const extractingTypes = ALLOWED_ATTACHMENT_MIME_TYPES.filter(
    (mime) => mime.startsWith("text/") || mime === "application/json"
  );
  const nonExtractingTypes = ALLOWED_ATTACHMENT_MIME_TYPES.filter(
    (mime) => !extractingTypes.includes(mime)
  );

  const [failed] = await db
    .select({ count: sql<number>`count(*)` })
    .from(conversationAttachments)
    .where(
      and(
        eq(conversationAttachments.appId, appId),
        eq(conversationAttachments.status, "failed")
      )
    );
  const [stuck] = await db
    .select({ count: sql<number>`count(*)` })
    .from(conversationAttachments)
    .where(
      and(
        eq(conversationAttachments.appId, appId),
        eq(conversationAttachments.status, "processing")
      )
    );

  const failedCount = Number(failed?.count ?? 0);
  const stuckCount = Number(stuck?.count ?? 0);

  const detail = {
    mode: "synchronous, in-process at commit (no separate worker)",
    extractionVersion: EXTRACTION_VERSION,
    textExtractingTypes: extractingTypes,
    acceptedWithoutTextExtraction: nonExtractingTypes,
    failedAttachments: failedCount,
    stuckInProcessing: stuckCount,
  };

  if (stuckCount > 0) {
    return {
      status: "unhealthy",
      summary: `${stuckCount} attachment(s) are stuck in \`processing\`. Extraction is synchronous, so this means a commit died mid-flight; the 24h unclaimed sweep will clear them.`,
      detail,
    };
  }
  return {
    status: "degraded",
    summary:
      "Text extraction covers text/Markdown/JSON/CSV. Images and PDFs are accepted and stored but yield no extracted text — a documented deferral, disclosed to the model as `image_not_analyzed`.",
    detail,
  };
}

// ─── Malware scanning ─────────────────────────────────────────────────────

/**
 * Fails loud in production and quiet elsewhere, mirroring
 * `resolveScanAdapter`'s own fail-closed behavior. The one case that must
 * never read healthy is production with no scanner: `resolveScanAdapter`
 * throws there, so uploads are already failing — reporting that clearly is
 * more useful than the 500s an operator would otherwise be reading backwards
 * from.
 */
export function checkMalwareScanningReadiness(
  env: EnvLike = process.env
): M13ReadinessSection {
  const configured = env.APPBUILDER_ATTACHMENT_SCANNER ?? null;
  const isProduction = env.NODE_ENV === "production";

  let adapterName: string | null = null;
  let resolutionError: string | null = null;
  try {
    adapterName = resolveScanAdapter(env).name;
  } catch (err) {
    resolutionError =
      err instanceof ScannerNotConfiguredError
        ? "not_configured"
        : "unrecognized_adapter";
  }

  const detail = {
    configuredAdapter: configured,
    resolvedAdapter: adapterName,
    environment: isProduction ? "production" : "non-production",
    failClosedInProduction: true,
  };

  if (resolutionError === "not_configured") {
    return {
      status: "unhealthy",
      summary:
        "APPBUILDER_ATTACHMENT_SCANNER is unset in production. Attachment commits fail closed — no upload can succeed until a scanner is configured.",
      detail,
    };
  }
  if (resolutionError === "unrecognized_adapter") {
    return {
      status: "unhealthy",
      summary:
        "APPBUILDER_ATTACHMENT_SCANNER names an adapter that is not registered — almost certainly a typo, which would otherwise silently mean no scanning.",
      detail,
    };
  }
  if (adapterName === "noop") {
    return {
      status: "not_configured",
      summary:
        "No content scanner is wired up. Uploads are accepted unscanned and each commit records an `attachment.scan_not_configured` event. Acceptable outside production only.",
      detail,
    };
  }
  return {
    status: "healthy",
    summary: `Attachment content is scanned by the "${adapterName}" adapter.`,
    detail,
  };
}

// ─── Provider modalities (vision) ─────────────────────────────────────────

/**
 * "Provider modalities" in the M13 doc. Vision is off by default and cannot
 * be turned on by configuration alone — the milestone also requires
 * "Document provider retention before production multimodal enablement", so
 * this reports the *combination* of the flag and whether that documentation
 * pointer has been supplied, and refuses to call flag-on-without-it healthy.
 */
export function checkModelVisionReadiness(
  env: EnvLike = process.env
): M13ReadinessSection {
  const enabled = isVisionEnabled(env);
  const retentionDocumented = Boolean(
    env.APPBUILDER_PROVIDER_RETENTION_DOC?.trim()
  );
  const providerName = env.APPBUILDER_AI_PROVIDER ?? "fake";
  const imagePartsImplemented = false; // see lib/modification/contextAssembler.ts#assembleAttachments

  const detail = {
    flagEnabled: enabled,
    provider: providerName,
    imagePartsImplemented,
    providerRetentionDocumented: retentionDocumented,
    disclosureWhenUnavailable: "vision_unavailable (grounded context redaction flag)",
  };

  if (!enabled) {
    return {
      status: "not_configured",
      summary:
        "Image analysis is off. Images are still accepted, stored, and listed; the grounded context discloses `vision_unavailable` so the assistant says it could not look at them rather than guessing.",
      detail,
    };
  }
  if (!imagePartsImplemented) {
    return {
      status: "unhealthy",
      summary:
        "Vision is enabled but no provider path sends image parts yet, so images still are not analyzed. Turn the flag off until a vision-capable provider is wired up — leaving it on claims a capability that does not exist.",
      detail,
    };
  }
  if (!retentionDocumented) {
    return {
      status: "degraded",
      summary:
        "Vision is enabled but APPBUILDER_PROVIDER_RETENTION_DOC is unset. M13 requires provider retention to be documented before production multimodal enablement.",
      detail,
    };
  }
  return {
    status: "healthy",
    summary: `Image analysis is enabled via the "${providerName}" provider, with provider retention documented.`,
    detail,
  };
}

// ─── URL import ───────────────────────────────────────────────────────────

/** The flag-aware companion to the slice F `referenceImport` section, which reports cached/stale/unavailable counts. */
export function checkUrlImportReadiness(
  env: EnvLike = process.env
): M13ReadinessSection {
  const enabled = isUrlImportsEnabled(env);
  const detail = {
    flagEnabled: enabled,
    cacheTtlSeconds: REFERENCE_LIMITS.CACHE_TTL_SECONDS,
    githubAuthentication: "none (public API only)",
    outboundPolicy:
      "https only, public addresses only, re-validated per redirect hop; see docs/appbuilder-m13-public-references.md",
    probesOnRead: false,
  };
  return enabled
    ? {
        status: "healthy",
        summary:
          "Public URL import is enabled. Every outbound request passes the SSRF policy and is bounded by size, type, redirect, and timeout limits.",
        detail,
      }
    : {
        status: "not_configured",
        summary:
          "Public URL import is off — no outbound fetch is made. References imported earlier stay listable with provenance and keep grounding conversations at their real freshness.",
        detail,
      };
}

// ─── Cleanup lag ──────────────────────────────────────────────────────────

/**
 * The M13 target is "Cleanup within retention window ≥ 99.9%". This measures
 * the complement directly: rows that are already past their deletion
 * deadline and still present. Anything above zero means the sweep is not
 * running often enough (or at all), which is invisible from the sweep's own
 * logs — a sweep that never runs logs nothing.
 */
export async function checkCleanupLagReadiness(
  db: Db,
  appId: string,
  now: Date = new Date()
): Promise<M13ReadinessSection> {
  const unclaimedCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [overdueAttachments] = await db
    .select({ count: sql<number>`count(*)` })
    .from(conversationAttachments)
    .where(
      and(
        eq(conversationAttachments.appId, appId),
        inArray(conversationAttachments.status, ["pending", "uploaded", "processing"]),
        lt(conversationAttachments.createdAt, unclaimedCutoff)
      )
    );

  const [overdueArtifacts] = await db
    .select({ count: sql<number>`count(*)` })
    .from(validationArtifacts)
    .where(
      and(
        eq(validationArtifacts.appId, appId),
        lt(validationArtifacts.retentionExpiresAt, now)
      )
    );

  const attachmentsOverdue = Number(overdueAttachments?.count ?? 0);
  const artifactsOverdue = Number(overdueArtifacts?.count ?? 0);
  const totalOverdue = attachmentsOverdue + artifactsOverdue;

  const detail = {
    unclaimedAttachmentsOverdue: attachmentsOverdue,
    unclaimedAttachmentWindowHours: 24,
    validationArtifactsOverdue: artifactsOverdue,
    sweep: "pnpm --filter @asafarim/appbuilder retention:sweep --apply",
  };

  if (totalOverdue === 0) {
    return {
      status: "healthy",
      summary: "Nothing is past its retention deadline.",
      detail,
    };
  }
  return {
    status: totalOverdue > 50 ? "unhealthy" : "degraded",
    summary: `${totalOverdue} row(s) are past their retention deadline and still present. Run the retention sweep with --apply, and check that its schedule is active.`,
    detail,
  };
}

// ─── Evaluation version ───────────────────────────────────────────────────

/**
 * Reports which regression corpus this deployment's code was built against.
 * Deliberately a build-time constant rather than a stored run result: the
 * question this answers is "what does this deployment's quality claim refer
 * to", and a stale stored score from an older corpus would answer it wrongly
 * while looking authoritative.
 */
export function checkEvaluationReadiness(): M13ReadinessSection {
  return {
    status: "healthy",
    summary: `Regression corpus ${EVALUATION_VERSION}. Gates are enforced in CI against the deterministic fake provider; real-provider semantic evaluation is a release gate, not per-commit CI.`,
    detail: {
      evaluationVersion: EVALUATION_VERSION,
      deterministicRun: "pnpm --filter @asafarim/appbuilder test:integration eval/",
      realProviderRun: "pnpm --filter @asafarim/appbuilder eval:m13:real",
      telemetry: "redacted scores and case ids only — never prompts or attachment content",
    },
  };
}

// ─── Assembled ────────────────────────────────────────────────────────────

export interface M13ReadinessSnapshot {
  storage: M13ReadinessSection;
  extraction: M13ReadinessSection;
  malwareScanning: M13ReadinessSection;
  modelVision: M13ReadinessSection;
  urlImport: M13ReadinessSection;
  cleanupLag: M13ReadinessSection;
  evaluation: M13ReadinessSection;
  featureFlags: FeatureFlagState[];
}

export async function buildM13ReadinessSnapshot(
  db: Db,
  appId: string,
  now: Date = new Date(),
  env: EnvLike = process.env
): Promise<M13ReadinessSnapshot> {
  const [extraction, cleanupLag] = await Promise.all([
    checkExtractionReadiness(db, appId),
    checkCleanupLagReadiness(db, appId, now),
  ]);

  return {
    storage: checkStorageReadiness(env),
    extraction,
    malwareScanning: checkMalwareScanningReadiness(env),
    modelVision: checkModelVisionReadiness(env),
    urlImport: checkUrlImportReadiness(env),
    cleanupLag,
    evaluation: checkEvaluationReadiness(),
    featureFlags: describeFeatureFlags(env),
  };
}

/**
 * The subset of M13 readiness that should stop a launch. Only genuine
 * misconfigurations qualify — a feature that is off on purpose
 * (`not_configured`) and a documented deferral (`degraded` extraction
 * coverage) are reported in their sections but never block, or every
 * deployment would launch with a permanent blocker it cannot clear.
 */
export function m13LaunchBlockingIssues(
  snapshot: M13ReadinessSnapshot
): string[] {
  const issues: string[] = [];
  const named: Array<[string, M13ReadinessSection]> = [
    ["Attachment storage", snapshot.storage],
    ["Attachment extraction", snapshot.extraction],
    ["Attachment scanning", snapshot.malwareScanning],
    ["Model vision", snapshot.modelVision],
    ["Public URL import", snapshot.urlImport],
    ["Retention cleanup", snapshot.cleanupLag],
  ];
  for (const [label, section] of named) {
    if (section.status === "unhealthy") issues.push(`${label}: ${section.summary}`);
  }
  return issues;
}
