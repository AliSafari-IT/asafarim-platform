"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, EmptyState } from "@asafarim/ui";
import { routes } from "@/lib/routes";
import { evaluateParentInboundMessage } from "./previewProtocol";
import type { SelectionContext } from "./types";

export interface PreviewPaneProps {
  appId: string;
  hasPreview: boolean;
  currentVersionNumber: number;
  selection: SelectionContext | null;
  onSelect: (selection: SelectionContext) => void;
  onClearSelection: () => void;
}

/**
 * Embeds the M06 preview route in an iframe and implements the PARENT side
 * of the selection-context protocol (see PreviewSelectionBridge.tsx for the
 * iframe side, and docs/appbuilder-m08-builder-workspace.md for the full
 * write-up). Security properties enforced here, all in one place:
 *
 * - `event.origin` must equal this page's own origin, and `event.source`
 *   must be exactly this iframe's `contentWindow` — messages from any other
 *   frame/origin are silently ignored.
 * - A handshake nonce, generated fresh per mount (and regenerated whenever
 *   the app's version changes — see the iframe `key` below), binds the
 *   parent and iframe to one specific embed session; a message carrying a
 *   stale or missing nonce is ignored.
 * - Only two inbound message `type`s are recognized at all
 *   (`ab-preview-ready`, `ab-preview-select`); anything else is ignored.
 * - A selection is only accepted if its `appId` matches this pane's own app
 *   and its `specificationVersionNumber` matches the CURRENTLY pinned
 *   version — a selection made against a version that has since been
 *   superseded is rejected with a visible "reselect" prompt rather than
 *   silently accepted.
 * - The iframe never receives cookies/tokens/actor identity via postMessage
 *   in either direction — only the nonce and stable spec identifiers.
 */
export function PreviewPane({ appId, hasPreview, currentVersionNumber, selection, onSelect, onClearSelection }: PreviewPaneProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const nonce = useMemo(() => crypto.randomUUID(), [currentVersionNumber]);
  const [staleSelectionNotice, setStaleSelectionNotice] = useState(false);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const result = evaluateParentInboundMessage({
        rawData: event.data,
        originMatches: event.origin === window.location.origin,
        sourceMatches: Boolean(iframeRef.current) && event.source === iframeRef.current!.contentWindow,
        expectedNonce: nonce,
        expectedAppId: appId,
        currentVersionNumber,
      });

      switch (result.kind) {
        case "handshake_ack":
          iframeRef.current?.contentWindow?.postMessage({ type: "ab-preview-handshake", nonce }, window.location.origin);
          return;
        case "selection":
          onSelect(result.selection);
          return;
        case "stale_version":
          setStaleSelectionNotice(true);
          return;
        case "rejected":
          // Wrong origin/source/nonce/app or an unallowlisted message type — silently ignored, never acted on.
          return;
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [appId, currentVersionNumber, nonce, onSelect]);

  if (!hasPreview) {
    return (
      <EmptyState
        title="No preview yet"
        description="A preview appears here once the app's first version has been generated and built."
      />
    );
  }

  const src = `${routes.appPreview(appId)}?embed=workspace&nonce=${nonce}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "var(--space-2)" }}>
      {staleSelectionNotice ? (
        <Alert tone="info">
          The preview updated since that selection was made.{" "}
          <Button type="button" size="sm" variant="secondary" onClick={() => setStaleSelectionNotice(false)}>
            Dismiss
          </Button>
        </Alert>
      ) : null}
      {selection ? (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)" }}>
          <span className="ui-hint">Selected: {selection.label ?? selection.componentId ?? selection.pageId}</span>
          <Button type="button" size="sm" variant="ghost" onClick={onClearSelection}>
            Clear
          </Button>
        </div>
      ) : null}
      <iframe
        key={currentVersionNumber}
        ref={iframeRef}
        src={src}
        title="App preview"
        style={{ flex: 1, width: "100%", border: "1px solid var(--line)", borderRadius: "var(--radius-sm)", minHeight: "20rem" }}
      />
    </div>
  );
}
