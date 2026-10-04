/**
 * Where the browser goes once sign-in succeeds (#800). `callbackUrl` is already the normalised value from
 * `normalizeCallbackUrl` (never the raw query string).
 *
 * `/oidc/*` is a server endpoint (the hand-off assertion), not a page. `router.push` would make Next fetch it in
 * the background first, which signs an assertion and throws it away, then fall back to a full page load that
 * signs a second one. So those go straight to a full page navigation, with no router calls.
 */
export interface SignInRouter {
  push(url: string): void;
  refresh(): void;
}

export function navigateAfterSignIn(
  callbackUrl: string,
  router: SignInRouter
): void {
  if (callbackUrl.startsWith("/oidc/")) {
    window.location.assign(callbackUrl);
  } else if (callbackUrl.startsWith("/")) {
    router.push(callbackUrl);
    router.refresh();
  } else {
    // An absolute URL on a trusted platform origin.
    window.location.href = callbackUrl;
  }
}
