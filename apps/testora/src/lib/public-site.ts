/**
 * Testora's public pages live on their own domain, testora.cloud (#762,
 * phase A), while the app itself stays on testora.asafarim.com until
 * cross-domain sign-in exists: the session cookie is scoped to .asafarim.com.
 * The gateway serves only the public pages on testora.cloud and redirects
 * everything else (infra/caddy/Caddyfile).
 *
 * So, on the public pages:
 *   - canonical and OpenGraph URLs point at the public domain;
 *   - links into the app are absolute, to the app's own origin, so they work
 *     the same from either host instead of relying on the gateway redirect.
 */
import { getPlatformLinks } from "@asafarim/ui";

/** Canonical origin of the public pages. */
export const PUBLIC_SITE_URL = process.env.NEXT_PUBLIC_TESTORA_PUBLIC_URL || "https://testora.cloud";

/** Paths the gateway serves on the public domain (keep in sync with the Caddyfile). */
export const PUBLIC_PATHS = ["/", "/about-this-project", "/roadmap"] as const;
export type PublicPath = (typeof PUBLIC_PATHS)[number];

/** An absolute link into the app (`/dashboard` → `https://testora.asafarim.com/dashboard`). */
export function appUrl(path: `/${string}`): string {
  return `${getPlatformLinks().testora.replace(/\/$/, "")}${path}`;
}

/** Canonical + OpenGraph URL for one public page, resolved against `metadataBase`. */
export function publicPageUrls(path: PublicPath) {
  return { alternates: { canonical: path }, openGraph: { url: path } } as const;
}
