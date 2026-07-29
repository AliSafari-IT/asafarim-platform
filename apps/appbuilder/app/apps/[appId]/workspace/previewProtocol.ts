/**
 * Pure, framework/DOM-free core of the M08 preview-selection postMessage
 * protocol — factored out of PreviewPane.tsx so its origin/source/nonce/
 * payload validation logic is unit-testable without a real browser
 * `MessageEvent`/iframe. PreviewPane.tsx supplies the DOM-derived booleans
 * (`event.origin === window.location.origin`, `event.source === iframe.
 * contentWindow`) and calls straight through to `evaluateParentInboundMessage`.
 */

export interface PreviewReadyMessage {
  type: "ab-preview-ready";
  nonce: string;
}
/**
 * M13 slice D — bounded DOM evidence about a click that did NOT land on an
 * instrumented component. Kept separate from the stable-id fields above on
 * purpose: the server maps this onto specification targets
 * (lib/modification/previewEvidence.ts) and never lets it become a mutation
 * target. Each field is length-capped here as well as by the server's Zod
 * schema, so a compromised frame cannot use the channel to push bulk data
 * into the parent.
 */
export interface PreviewDomEvidence {
  domTagName?: string;
  domRole?: string;
  domTextSnippet?: string;
  domOutsideSpecRegion?: boolean;
}

export interface PreviewSelectMessage {
  type: "ab-preview-select";
  nonce: string;
  appId: string;
  specificationVersionNumber: number;
  buildId?: string;
  pageId?: string;
  componentId?: string;
  componentKind?: string;
  label?: string;
  previewEvidence?: PreviewDomEvidence;
}

const MAX_DOM_TAG_NAME_CHARS = 40;
const MAX_DOM_ROLE_CHARS = 40;
const MAX_DOM_TEXT_CHARS = 200;

/** Parses (and re-bounds) the optional DOM-evidence block. Returns `undefined` rather than throwing for anything malformed — evidence is best-effort by design. */
function parseDomEvidence(raw: unknown): PreviewDomEvidence | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const d = raw as Record<string, unknown>;
  const evidence: PreviewDomEvidence = {};
  if (typeof d.domTagName === "string") evidence.domTagName = d.domTagName.slice(0, MAX_DOM_TAG_NAME_CHARS);
  if (typeof d.domRole === "string") evidence.domRole = d.domRole.slice(0, MAX_DOM_ROLE_CHARS);
  if (typeof d.domTextSnippet === "string") evidence.domTextSnippet = d.domTextSnippet.slice(0, MAX_DOM_TEXT_CHARS);
  if (typeof d.domOutsideSpecRegion === "boolean") evidence.domOutsideSpecRegion = d.domOutsideSpecRegion;
  return Object.keys(evidence).length > 0 ? evidence : undefined;
}
export type ParentInboundMessage = PreviewReadyMessage | PreviewSelectMessage;

const ALLOWLISTED_TYPES = new Set(["ab-preview-ready", "ab-preview-select"]);

/** Parses raw `event.data` into a known message shape, or `null` if it isn't one of the two allowlisted types with well-formed fields. Never throws on malformed input. */
export function parseParentInboundMessage(data: unknown): ParentInboundMessage | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d.type !== "string" || !ALLOWLISTED_TYPES.has(d.type)) return null;
  if (typeof d.nonce !== "string") return null;

  if (d.type === "ab-preview-ready") {
    return { type: "ab-preview-ready", nonce: d.nonce };
  }

  // ab-preview-select
  if (typeof d.appId !== "string" || typeof d.specificationVersionNumber !== "number") return null;
  return {
    type: "ab-preview-select",
    nonce: d.nonce,
    appId: d.appId,
    specificationVersionNumber: d.specificationVersionNumber,
    buildId: typeof d.buildId === "string" ? d.buildId : undefined,
    pageId: typeof d.pageId === "string" ? d.pageId : undefined,
    componentId: typeof d.componentId === "string" ? d.componentId : undefined,
    componentKind: typeof d.componentKind === "string" ? d.componentKind : undefined,
    label: typeof d.label === "string" ? d.label : undefined,
    previewEvidence: parseDomEvidence(d.previewEvidence),
  };
}

export interface EvaluateParams {
  rawData: unknown;
  /** `event.origin === window.location.origin`, computed by the caller. */
  originMatches: boolean;
  /** `event.source === iframe.contentWindow`, computed by the caller. */
  sourceMatches: boolean;
  expectedNonce: string;
  expectedAppId: string;
  /** The app's currently known specification version, for stale-selection rejection. */
  currentVersionNumber: number;
}

export type EvaluateResult =
  | { kind: "handshake_ack" }
  | {
      kind: "selection";
      selection: {
        appId: string;
        specificationVersionNumber: number;
        pageId?: string;
        componentId?: string;
        componentKind?: string;
        label?: string;
        previewEvidence?: PreviewDomEvidence;
      };
    }
  | { kind: "stale_version" }
  | { kind: "rejected"; reason: "origin_mismatch" | "source_mismatch" | "unallowlisted_type" | "nonce_mismatch" | "app_mismatch" };

/**
 * The single decision function for an inbound `message` event on the
 * parent (workspace) side. Order matters: origin/source are checked before
 * anything about the payload is even parsed, so a message from the wrong
 * frame/origin never influences behavior regardless of its contents.
 */
export function evaluateParentInboundMessage(params: EvaluateParams): EvaluateResult {
  if (!params.originMatches) return { kind: "rejected", reason: "origin_mismatch" };
  if (!params.sourceMatches) return { kind: "rejected", reason: "source_mismatch" };

  const message = parseParentInboundMessage(params.rawData);
  if (!message) return { kind: "rejected", reason: "unallowlisted_type" };
  if (message.nonce !== params.expectedNonce) return { kind: "rejected", reason: "nonce_mismatch" };

  if (message.type === "ab-preview-ready") return { kind: "handshake_ack" };

  if (message.appId !== params.expectedAppId) return { kind: "rejected", reason: "app_mismatch" };
  if (message.specificationVersionNumber !== params.currentVersionNumber) return { kind: "stale_version" };

  return {
    kind: "selection",
    selection: {
      appId: message.appId,
      specificationVersionNumber: message.specificationVersionNumber,
      pageId: message.pageId,
      componentId: message.componentId,
      componentKind: message.componentKind,
      label: message.label,
      previewEvidence: message.previewEvidence,
    },
  };
}
