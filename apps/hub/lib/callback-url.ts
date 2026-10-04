/**
 * Hub's callback check (#804): the shared helper in @asafarim/auth/callback-url (#807), bound to Hub's own origin,
 * the platform's trusted origins and Hub's defaults. The ONE copy on Hub: sign-in uses it, and so does the page.
 * `/oidc/continue?ticket=…` is an ordinary same-origin path and passes unchanged: the sign-in hand-off depends
 * on it (#801).
 */
import { createCallbackUrlNormalizer } from "@asafarim/auth/callback-url";
import { getPlatformLinks, getTrustedPlatformOrigins } from "@asafarim/ui";

export const DEFAULT_CALLBACK = "/dashboard";

export const normalizeCallbackUrl = createCallbackUrlNormalizer({
  selfOrigin: new URL(getPlatformLinks().hub).origin,
  trustedOrigins: getTrustedPlatformOrigins(),
  fallback: DEFAULT_CALLBACK,
  signInPaths: ["/sign-in", "/sign-up"],
});
