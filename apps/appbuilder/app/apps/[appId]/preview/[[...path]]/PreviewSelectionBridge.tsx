"use client";

import { useEffect, useRef } from "react";

/**
 * Runs ONLY inside the preview iframe when embedded in the M08 builder
 * workspace (`?embed=workspace&nonce=...` — absent for the standalone
 * `/apps/{appId}/preview` route, which behaves exactly as it did before
 * M08). Implements the iframe side of the selection-context protocol
 * documented in docs/appbuilder-m08-builder-workspace.md:
 *
 * - Never sends anything but stable spec identifiers already present as
 *   `data-ab-*` attributes on the rendered DOM (see
 *   @asafarim/appbuilder-runtime's renderPreview.tsx) — never raw DOM/HTML,
 *   cookies, tokens, full record data, or actor identity.
 * - Only completes the handshake with a nonce matching the one this frame
 *   was given in its own query string, and only ever sends to
 *   `window.parent`, targeted at this page's own origin (never `"*"`).
 * - Only ever accepts a message whose `event.source === window.parent` and
 *   `event.origin === window.location.origin`.
 */
export function PreviewSelectionBridge({
  appId,
  specificationVersionNumber,
  buildId,
  nonce,
}: {
  appId: string;
  specificationVersionNumber: number;
  buildId: string;
  nonce: string;
}) {
  const handshakeCompleteRef = useRef(false);
  const selectedElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (window.parent === window) return; // not embedded — no-op, standalone preview untouched

    function clearSelectionOutline() {
      if (selectedElementRef.current) {
        selectedElementRef.current.style.outline = "";
        selectedElementRef.current.style.outlineOffset = "";
      }
    }

    function onMessage(event: MessageEvent) {
      if (event.source !== window.parent) return;
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;

      if (data.type === "ab-preview-handshake" && data.nonce === nonce) {
        handshakeCompleteRef.current = true;
      }
    }

    function onClick(event: MouseEvent) {
      if (!handshakeCompleteRef.current) return;
      const target = event.target as HTMLElement | null;
      const el = target?.closest<HTMLElement>("[data-ab-component-id]");
      if (!el) return;

      clearSelectionOutline();
      el.style.outline = "2px solid #7c3aed";
      el.style.outlineOffset = "2px";
      selectedElementRef.current = el;

      const pageId = el.getAttribute("data-ab-page-id") ?? undefined;
      const componentId = el.getAttribute("data-ab-component-id") ?? undefined;
      const componentKind = el.getAttribute("data-ab-component-kind") ?? undefined;

      window.parent.postMessage(
        {
          type: "ab-preview-select",
          nonce,
          appId,
          specificationVersionNumber,
          buildId,
          pageId,
          componentId,
          componentKind,
          label: componentKind && pageId ? `${pageId} / ${componentKind}` : undefined,
        },
        window.location.origin,
      );
    }

    window.addEventListener("message", onMessage);
    document.addEventListener("click", onClick, true);
    // Announce readiness so the parent can (re)send its handshake if the
    // iframe reloaded after the parent's own initial handshake attempt.
    window.parent.postMessage({ type: "ab-preview-ready", nonce }, window.location.origin);

    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("click", onClick, true);
      clearSelectionOutline();
    };
  }, [appId, specificationVersionNumber, buildId, nonce]);

  return null;
}
