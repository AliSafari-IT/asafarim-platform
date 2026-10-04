/**
 * GET /oidc/continue?ticket=… (ADR 0002, A2; #782). The identity service hands
 * the browser here. Order matters:
 *  1. hand-off not configured (before P2.3) → "not enabled";
 *  2. the ticket must verify (pinned key, aud=hub, exp, nonce), else an error
 *     page and no assertion, signed in or not;
 *  3. no Hub session → Hub's own sign-in, returning here;
 *  4. the account must exist and be active (read now, not from the session);
 *  5. an auto-submitted POST of a fresh assertion to the identity service.
 */
import { auth } from "@asafarim/auth";
import { prisma } from "@asafarim/db";
import {
  HANDOFF_ERROR_CSP,
  TicketError,
  assertionPage,
  assertionPageCsp,
  assertionTarget,
  handoffErrorPage,
  loadHandoffConfig,
  signAssertion,
  verifyTicket,
} from "@/lib/oidc-handoff";

export const dynamic = "force-dynamic";

/** Every response gets a strict CSP: the assertion page its own (#794), the rest no script at all. */
function html(status: number, body: string, csp: string = HANDOFF_ERROR_CSP): Response {
  return new Response(body, {
    status,
    headers: {
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
  const ticket = url.searchParams.get("ticket") ?? "";
  let uid: string;
  try {
    ({ uid } = await verifyTicket(ticket, config.ticketPublicKey));
  } catch (err) {
    const code = err instanceof TicketError ? err.code : "invalid";
    return html(
      400,
      handoffErrorPage({
        title: "This sign-in link has expired",
        message: "The link from the app is no longer valid.",
        code: `ticket_${code}`,
      }),
    );
  }

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    // Hub's existing sign-in (password, email code, Google), then back here.
    const signIn = new URL("/sign-in", url.origin);
    signIn.searchParams.set("callbackUrl", `${url.pathname}${url.search}`);
    return Response.redirect(signIn, 303);
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
    );
  }

  const assertion = await signAssertion(user.id, uid, config.assertionPrivateKey);
  return html(200, assertionPage(assertionTarget(config.identityIssuer, uid), assertion), assertionPageCsp(config.identityIssuer));
}
