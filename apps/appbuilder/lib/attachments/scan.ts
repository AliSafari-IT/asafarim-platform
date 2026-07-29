/**
 * Malware/content-scan adapter boundary (docs/appbuilder-m13-multimodal-
 * contextual-assistant.md: "Scan through an adapter. Production requires a
 * real scanner; development may explicitly report not_configured."). No
 * scanner is wired up in this slice — mirrors M09's documented malware-
 * scanning deferral (lib/generated-data/files.ts's module docstring) —
 * but the ADAPTER SHAPE exists now so a real one (ClamAV daemon, a vendor
 * API) can be dropped in behind `resolveScanAdapter` without touching
 * lib/repositories/attachments.ts.
 */
export type ScanVerdict = "clean" | "flagged" | "not_configured";

export interface ScanResult {
  verdict: ScanVerdict;
  adapterName: string;
  detail?: string;
}

export interface ContentScanAdapter {
  readonly name: string;
  scan(bytes: Buffer, mimeType: string): Promise<ScanResult>;
}

/** Never flags anything — honestly reports `not_configured` rather than pretending to have scanned. Safe for local dev/CI; `resolveScanAdapter` refuses to use it in production. */
const noopScanAdapter: ContentScanAdapter = {
  name: "noop",
  async scan(): Promise<ScanResult> {
    return { verdict: "not_configured", adapterName: "noop" };
  },
};

export class ScannerNotConfiguredError extends Error {
  constructor() {
    super("APPBUILDER_ATTACHMENT_SCANNER is not configured — refusing to accept attachments in production without a real content scanner.");
    this.name = "ScannerNotConfiguredError";
  }
}

/**
 * Resolves the configured adapter. In production, an unset/unrecognized
 * `APPBUILDER_ATTACHMENT_SCANNER` is a hard failure (fail closed) rather
 * than silently serving unscanned uploads; outside production it falls
 * back to the honest no-op adapter above.
 */
export function resolveScanAdapter(env: NodeJS.ProcessEnv = process.env): ContentScanAdapter {
  const configured = env.APPBUILDER_ATTACHMENT_SCANNER;
  if (!configured) {
    if (env.NODE_ENV === "production") throw new ScannerNotConfiguredError();
    return noopScanAdapter;
  }
  // No real adapter is implemented yet in any environment — a future
  // adapter registers itself here by name. An explicitly configured but
  // unrecognized name is always a hard failure, in every environment,
  // since it almost certainly means a typo'd env var silently downgraded
  // to no scanning.
  throw new Error(`Unrecognized APPBUILDER_ATTACHMENT_SCANNER "${configured}" — no adapter registered for it.`);
}
