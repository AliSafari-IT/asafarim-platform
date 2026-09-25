import { PLATFORM_APPS, canAccessApp, type AppAccessContext } from "@asafarim/auth";
import type { AccessMapNode } from "../_components/AccessMap";

/**
 * Every live platform app (Hub excluded — it is the identity at the centre),
 * marked granted/locked with the same canAccessApp rule the apps enforce.
 *
 * Apps flagged `requiresAccountToUse` are "preview" for guests: their public
 * pages open, but real work needs an account.
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
    const granted = canAccessApp(app, context);
    return {
      key: app.key,
      glyph: app.glyph,
      name: app.name.replace(/^ASafarIM\s+/i, ""),
      granted,
      // Open to a guest, but only its public pages — the workspace needs an
      // account (e.g. Vionto, EduMatch). Signed-in users get the full app.
      preview: granted && !context.authenticated && Boolean(app.requiresAccountToUse),
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
