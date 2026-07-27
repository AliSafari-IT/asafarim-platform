import { checksumOf as canonicalChecksumOf } from "@asafarim/appbuilder-schema";
import type { releases } from "../db/schema";
import type { DataCompatibilityResult } from "./dataCompatibility";
import type { EligibilityEvidence } from "./eligibility";

/**
 * The immutable, frozen provenance record persisted once at `prepareRelease`
 * time (`releases.manifest`), checksummed via `manifestChecksum` so any
 * later reader can prove the manifest a deployment acted on is byte-
 * identical to the one that was approved. Every field here is derived
 * SERVER-SIDE from already-persisted rows (a validation run, a preview
 * build, a specification version, the app's own row) — nothing is ever
 * accepted from the browser. Approval/deployment actor and timestamp facts
 * are deliberately NOT part of this frozen object (they don't exist yet at
 * preparation time) — they live on the `releases` row's own columns and are
 * merged in only when a caller reads the release (see
 * `composeManifestView`), never re-frozen into this checksummed payload.
 */
export interface ReleaseManifest {
  releaseId: string;
  appId: string;
  appSlug: string;
  productionHost: string;

  specificationVersionId: string;
  specificationVersionNumber: number;
  specificationChecksum: string;
  specificationSchemaVersion: string;

  previewBuildId: string | null;
  previewChecksum: string | null;
  registryVersion: string;

  validationRunId: string | null;
  gateSetVersion: string | null;

  dataCompatibility: DataCompatibilityResult;

  /** The app's ACTIVE production release at the moment this one was prepared — the rollback breadcrumb, frozen even before this release is ever approved/deployed. */
  previousReleaseId: string | null;

  initiatingActorPrincipalId: string;
  preparedAt: string;
}

export interface BuildReleaseManifestInput {
  releaseId: string;
  appId: string;
  appSlug: string;
  productionHost: string;
  evidence: EligibilityEvidence;
  previousReleaseId: string | null;
  initiatingActorPrincipalId: string;
  preparedAt: Date;
}

export function buildReleaseManifest(input: BuildReleaseManifestInput): ReleaseManifest {
  const { evidence } = input;
  return {
    releaseId: input.releaseId,
    appId: input.appId,
    appSlug: input.appSlug,
    productionHost: input.productionHost,

    specificationVersionId: evidence.specificationVersion.id,
    specificationVersionNumber: evidence.specificationVersion.versionNumber,
    specificationChecksum: evidence.specificationVersion.checksum,
    specificationSchemaVersion: evidence.specificationVersion.schemaVersion,

    previewBuildId: evidence.previewBuild?.id ?? null,
    previewChecksum: evidence.previewBuild?.checksum ?? null,
    registryVersion: evidence.previewBuild?.registryVersion ?? "",

    validationRunId: evidence.validationRun?.id ?? null,
    gateSetVersion: evidence.validationRun?.gateSetVersion ?? null,

    dataCompatibility: evidence.dataCompatibility,

    previousReleaseId: input.previousReleaseId,
    initiatingActorPrincipalId: input.initiatingActorPrincipalId,
    preparedAt: input.preparedAt.toISOString(),
  };
}

/** Deterministic — same manifest object always hashes to the same checksum, regardless of key insertion order (see @asafarim/appbuilder-schema's canonicalize). */
export function computeManifestChecksum(manifest: ReleaseManifest): string {
  return canonicalChecksumOf(manifest);
}

export type ReleaseRow = typeof releases.$inferSelect;

/** The full, read-only provenance view an API/UI reads — the frozen manifest plus the release row's own (mutable-until-terminal) approval/deployment facts. Never used as an input to anything; purely a projection for display. */
export function composeManifestView(release: ReleaseRow): ReleaseManifest & {
  status: ReleaseRow["status"];
  approvedByPrincipalId: string | null;
  approvedAt: Date | null;
  publishedByPrincipalId: string | null;
  publishedAt: Date | null;
  manifestChecksum: string;
} {
  const manifest = release.manifest as unknown as ReleaseManifest;
  return {
    ...manifest,
    status: release.status,
    approvedByPrincipalId: release.approvedByPrincipalId,
    approvedAt: release.approvedAt,
    publishedByPrincipalId: release.publishedByPrincipalId,
    publishedAt: release.publishedAt,
    manifestChecksum: release.manifestChecksum,
  };
}
