import { PLATFORM_APPS, canAccessApp, type AppAccessContext } from "@asafarim/auth";
import type { AccessMapNode } from "../_components/AccessMap";

/**
 * Every live platform app (Hub excluded — it is the identity at the centre),
 * marked granted/locked with the same canAccessApp rule the apps enforce.
 */
export function getAccessMapNodes(
  context: AppAccessContext,
  links: object
): AccessMapNode[] {
  return PLATFORM_APPS.filter(
    (app) => app.key !== "hub" && app.status === "active" && app.key in links
  ).map((app) => ({
    key: app.key,
    glyph: app.glyph,
    name: app.name.replace(/^ASafarIM\s+/i, ""),
    granted: canAccessApp(app, context),
  }));
}

export function initialsOf(name: string | null | undefined, fallback: string): string {
  const source = (name ?? "").trim() || fallback;
  const parts = source.split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0]![0]! + parts[parts.length - 1]![0]! : source.slice(0, 2);
  return letters.toUpperCase();
}
