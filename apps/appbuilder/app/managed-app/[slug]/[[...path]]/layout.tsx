import type { ReactNode } from "react";
import "@asafarim/appbuilder-runtime/styles.css";
import "../../../apps/[appId]/preview/[[...path]]/live/live.css";

/**
 * Scopes the generated-app chrome/registry stylesheet to just the M11
 * production route, mirroring app/apps/[appId]/preview/[[...path]]/layout.tsx
 * exactly (same stylesheet, same rationale) — this route reuses that
 * folder's `live/` Client Component tree directly rather than duplicating
 * it, so it must load the identical CSS.
 */
export default function ManagedAppLayout({ children }: { children: ReactNode }) {
  return children;
}
