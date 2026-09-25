import { PLATFORM_APPS, canAccessApp, type AppAccessContext } from "@asafarim/auth";
import type { AccessMapNode } from "../_components/AccessMap";

/**
 * Every live platform app (Hub excluded — it is the identity at the centre),
 * marked granted/locked with the same canAccessApp rule the apps enforce.
 *
 * Signed-out visitors get a sign-in link on locked apps that returns them to
 * that app afterwards; signed-in users whose roles don't cover an app get no
 * link (signing in again wouldn't change anything).
 */
export function getAccessMapNodes(context: AppAccessContext, links: object): AccessMapNode[] {
  const urls = links as Record<string, string>;
  return PLATFORM_APPS.filter(
    (app) => app.key !== "hub" && app.status === "active" && app.key in urls
  ).map((app) => {
    const href = urls[app.key];
    return {
      key: app.key,
      glyph: app.glyph,
      name: app.name.replace(/^ASafarIM\s+/i, ""),
      granted: canAccessApp(app, context),
      href,
      description: app.description,
      meta: app.meta,
      lockedHref: context.authenticated
        ? undefined
        : `/sign-in?callbackUrl=${encodeURIComponent(href ?? "/")}`,
    };
  });
}

export function initialsOf(name: string | null | undefined, fallback: string): string {
  const source = (name ?? "").trim() || fallback;
  const parts = source.split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0]![0]! + parts[parts.length - 1]![0]! : source.slice(0, 2);
  return letters.toUpperCase();
}
