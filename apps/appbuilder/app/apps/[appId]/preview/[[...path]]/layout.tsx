import type { ReactNode } from "react";
import "@asafarim/appbuilder-runtime/styles.css";
import "./live/live.css";

/**
 * Scopes the generated-app chrome/registry stylesheet to just the preview
 * route — the rest of AppBuilder (catalog, builder shell) never loads it.
 */
export default function PreviewLayout({ children }: { children: ReactNode }) {
  return children;
}
