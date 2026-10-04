/**
 * GET /oidc/continue[?ticket=…] (ADR 0002, A2; #782, #801). The identity service hands the browser here. Order matters
 * (spec §4.3):
 *  1. hand-off not configured (before P2.3) → "not enabled";
 *  2. a `ticket` param must verify (pinned key, aud=hub, exp, nonce): invalid → an error page and no assertion, signed
 *     in or not; expired → the same page with a "Try again" link to the identity service; valid → its `uid`;
 *  3. no `ticket` param: the resume cookie must be valid, else "handoff_missing" (no button: the uid is unknown);
 *     valid → its `uid`. The cookie only stands in for a ticket, so a request with both uses the ticket;
 *  4. no Hub session → set/refresh the resume cookie for `uid`, then Hub's own sign-in, returning here WITHOUT the
 *     ticket (a sign-in can outlast the ticket's 120 s, and the ticket doesn't belong in URLs, logs or history);
 *  5. the account must exist and be active (read now, not from the session), else 403 and the cookie is cleared;
 *  6. an auto-submitted POST of a fresh assertion; the identity service finishes the sign-in only in the browser that
 *     started it. The resume cookie is NOT cleared here (a client-side router fetch of this route must not eat the
 *     cookie before the real navigation); if a ticket was present, the cookie is set for its `uid`.
 */
import { auth } from "@asafarim/auth";
import { prisma } from "@asafarim/db";
import {
  HANDOFF_ERROR_CSP,
  assertionPage,
  assertionPageCsp,
  assertionTarget,
  handoffErrorPage,
  loadHandoffConfig,
  readCookie,
  restartTarget,
  resumeClearCookie,
  resumeCookieName,
  resumeKey,
  resumeSetCookie,
  signAssertion,
  signResume,
  verifyResume,
  verifyTicket,
} from "@/lib/oidc-handoff";

export const dynamic = "force-dynamic";

/** Every response gets a strict CSP: the assertion page its own (#794), the rest no script at all. */
function html(status: number, body: string, csp: string = HANDOFF_ERROR_CSP, setCookie?: string): Response {
  return new Response(body, {
    status,
    headers: {
      ...(setCookie ? { "set-cookie": setCookie } : {}),
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": csp,
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-frame-options": "DENY",
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  const config = await loadHandoffConfig();
  if (!config) {
    return html(
      503,
      handoffErrorPage({
        title: "Not available yet",
        message: "Signing in to ASafariM apps on their own domains isn't enabled yet.",
        code: "handoff_not_enabled",
      }),
    );
  }

  const url = new URL(request.url);
  const secure = process.env.NODE_ENV === "production";
  const key = resumeKey();

  let uid: string;
  const hasTicket = url.searchParams.has("ticket");
  if (hasTicket) {
    const result = await verifyTicket(url.searchParams.get("ticket") ?? "", config.ticketPublicKey);
    if (!result.ok) {
      return html(
        400,
        handoffErrorPage({
          title: "This sign-in link has expired",
          message: "The link from the app is no longer valid.",
          code: `ticket_${result.code}`,
          action: result.restartUid
            ? { href: restartTarget(config.identityIssuer, result.restartUid), label: "Try again" }
            : undefined,
        }),
      );
    }
    uid = result.uid;
  } else {
    const token = readCookie(request.headers.get("cookie"), resumeCookieName(secure));
    const resumed = token ? await verifyResume(token, key) : null;
    if (!resumed) {
      return html(
        400,
        handoffErrorPage({
          title: "This sign-in link has expired",
          message: "The sign-in couldn't be resumed.",
          code: "handoff_missing",
        }),
      );
    }
    uid = resumed.uid;
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    // Hub's existing sign-in (password, email code, Google), then back here: the uid rides in the resume cookie, the
    // ticket is never put in callbackUrl.
    const signIn = new URL("/sign-in", url.origin);
    signIn.searchParams.set("callbackUrl", url.pathname);
    return new Response(null, {
      status: 303,
      headers: {
        location: signIn.toString(),
        "set-cookie": resumeSetCookie(await signResume(uid, key), secure),
        "cache-control": "no-store",
      },
    });
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, isActive: true } });
  if (!user || !user.isActive) {
    return html(
      403,
      handoffErrorPage({
        title: "This account can't sign in",
        message: "Your account isn't active.",
        code: "account_inactive",
      }),
      HANDOFF_ERROR_CSP,
      resumeClearCookie(secure),
    );
  }

  const assertion = await signAssertion(user.id, uid, config.assertionPrivateKey);
  return html(
    200,
    assertionPage(assertionTarget(config.identityIssuer, uid), assertion),
    assertionPageCsp(config.identityIssuer),
    hasTicket ? resumeSetCookie(await signResume(uid, key), secure) : undefined,
  );
}
