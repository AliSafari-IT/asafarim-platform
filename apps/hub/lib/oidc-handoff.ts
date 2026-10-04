/**
 * Hub's side of the ASafariM OS sign-in hand-off (ADR 0002, Addendum A2;
 * #782, P2.2). The identity service (id.asafarim.site) sends the browser here
 * with a short-lived ticket; Hub signs the person in with its existing sign-in
 * and auto-POSTs a signed assertion back. Contract (identity side:
 * asafarim-os core/identity/src/handoff.ts):
 *
 *   ticket     identity → Hub   EdDSA  iss=id  aud=hub  uid, nonce         exp ≤ 120 s
 *   assertion  Hub → identity   EdDSA  iss=hub aud=id   sub, uid, jti     exp ≤ 60 s
 *
 * Each direction has its own Ed25519 key pair, unrelated to the OIDC JWKS.
 * Until P2.3 sets the env below, /oidc/continue answers "not enabled".
 *
 * Why auto-submitting the assertion is safe (#802). /oidc/continue signs an assertion for whoever is signed in to
 * Hub, so a forwarded `/oidc/continue?ticket=…` link could look like a way to finish someone else's sign-in. It
 * isn't: the identity service does not finish a login on Hub's POST. It parks the verified `sub`, sets a
 * completion cookie in the browser that posted, and finishes only in a browser that holds BOTH that completion
 * cookie AND the interaction cookie of the browser that started the sign-in (asafarim-os
 * core/identity/README.md, "Login hand-off (ADR 0002, A2)", steps 5–6). Consequences for this file:
 *   - Hub must never treat a successful POST as "signed in at the app": completion happens only at the identity
 *     service.
 *   - The ticket's `nonce` only makes each ticket unique. Binding to a browser is done by that completion step,
 *     not by the nonce, so Hub deliberately does NOT copy the nonce into the assertion: nothing would check it.
 *
 * Slow sign-ins (#801, spec §4). A ticket lives 120 s, but an email code, Google or a sign-up can take longer. So
 * once a ticket has verified, /oidc/continue keeps the interaction `uid` in a short-lived signed RESUME cookie and
 * sends the person to sign in WITHOUT the ticket in the URL; it resumes from the cookie afterwards. The cookie only
 * stands in for the ticket: it never skips the session check, and Hub still re-reads `isActive` from the database.
 * It is deliberately not cleared on success (a later bare visit can at worst sign an assertion for a finished
 * interaction, which the identity service refuses).
 */
import { createHash, hkdfSync, randomBytes } from "node:crypto";
import { SignJWT, errors as joseErrors, importJWK, jwtVerify, type CryptoKey, type JWK, type JWTPayload, type KeyObject } from "jose";

export const TICKET_ISSUER = "id";
export const TICKET_AUDIENCE = "hub";
export const TICKET_MAX_TTL_SECONDS = 120;

export const ASSERTION_ISSUER = "hub";
export const ASSERTION_AUDIENCE = "id";
export const ASSERTION_TTL_SECONDS = 60;

type Key = CryptoKey | KeyObject;

export interface HandoffConfig {
  /** The identity service's public key: verifies tickets. */
  ticketPublicKey: Key;
  /** Hub's private key: signs assertions. */
  assertionPrivateKey: Key;
  /** e.g. https://id.asafarim.site; assertions are posted to <issuer>/interaction/<uid>/hub. */
  identityIssuer: string;
}

export type TicketFailure = "wrong_audience" | "expired" | "bad_signature" | "missing_nonce" | "invalid";

/** A ticket's `uid` (also used for the resume cookie's): what the identity service puts in its interaction URLs. */
const UID_RE = /^[\w-]{1,128}$/;

export type TicketResult =
  | { ok: true; uid: string; nonce: string }
  /** `restartUid` only for `expired`: the interaction to send the person back to for a new ticket (spec §4.4). */
  | { ok: false; code: TicketFailure; restartUid?: string };

type Env = Record<string, string | undefined>;

async function ed25519(env: Env, name: string, kind: "public" | "private"): Promise<Key> {
  let jwk: JWK;
  try {
    jwk = JSON.parse(env[name] ?? "") as JWK;
  } catch {
    throw new Error(`${name} is not valid JSON`);
  }
  if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519") throw new Error(`${name} must be an Ed25519 JWK`);
  if (kind === "public" && jwk.d) throw new Error(`${name} must be the public key only`);
  if (kind === "private" && !jwk.d) throw new Error(`${name} must be a private key`);
  return importJWK(jwk, "EdDSA") as Promise<Key>;
}

/**
 * The hand-off config from env, or null while the hand-off isn't enabled
 * (nothing set). A partial or malformed config throws: that's a deployment
 * mistake to surface, not a reason to fall back.
 */
export async function loadHandoffConfig(env: Env = process.env): Promise<HandoffConfig | null> {
  const names = ["HUB_IDENTITY_TICKET_PUBLIC_JWK", "HUB_OIDC_ASSERTION_PRIVATE_JWK", "IDENTITY_ISSUER_URL"];
  const set = names.filter((n) => env[n]);
  if (set.length === 0) return null;
  if (set.length !== names.length) throw new Error(`OIDC hand-off is half-configured: set all of ${names.join(", ")}`);
  const issuer = new URL(env.IDENTITY_ISSUER_URL!);
  const local = issuer.hostname === "localhost" || issuer.hostname === "127.0.0.1";
  if (issuer.protocol !== "https:" && !local) throw new Error("IDENTITY_ISSUER_URL must be https");
  return {
    ticketPublicKey: await ed25519(env, "HUB_IDENTITY_TICKET_PUBLIC_JWK", "public"),
    assertionPrivateKey: await ed25519(env, "HUB_OIDC_ASSERTION_PRIVATE_JWK", "private"),
    identityIssuer: issuer.origin,
  };
}

/** Verify the identity service's ticket; returns the interaction uid, or why not (never throws). */
export async function verifyTicket(ticket: string, publicKey: Key, now = new Date()): Promise<TicketResult> {
  let payload;
  try {
    ({ payload } = await jwtVerify(ticket, publicKey, {
      algorithms: ["EdDSA"],
      issuer: TICKET_ISSUER,
      audience: TICKET_AUDIENCE,
      requiredClaims: ["uid", "iat", "exp"],
      currentDate: now,
    }));
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) return { ok: false, code: "expired", restartUid: restartUidOf(err.payload) };
    if (err instanceof joseErrors.JWSSignatureVerificationFailed) return { ok: false, code: "bad_signature" };
    if (err instanceof joseErrors.JWTClaimValidationFailed && err.claim === "aud") return { ok: false, code: "wrong_audience" };
    return { ok: false, code: "invalid" };
  }
  if (typeof payload.nonce !== "string" || payload.nonce.length < 16) return { ok: false, code: "missing_nonce" };
  if (typeof payload.uid !== "string" || !UID_RE.test(payload.uid)) return { ok: false, code: "invalid" };
  if ((payload.exp as number) - (payload.iat as number) > TICKET_MAX_TTL_SECONDS) return { ok: false, code: "invalid" };
  return { ok: true, uid: payload.uid, nonce: payload.nonce };
}

/**
 * jose sets `JWTExpired.payload` only after the signature has checked out, but the order of its claim checks is an
 * implementation detail, so issuer, audience and uid are checked here explicitly.
 */
function restartUidOf(payload: JWTPayload): string | undefined {
  const audience = Array.isArray(payload.aud) ? payload.aud.includes(TICKET_AUDIENCE) : payload.aud === TICKET_AUDIENCE;
  if (payload.iss !== TICKET_ISSUER || !audience) return undefined;
  return typeof payload.uid === "string" && UID_RE.test(payload.uid) ? payload.uid : undefined;
}

/** Hub's assertion for interaction `uid`: sub = the platform user id, a fresh jti, 60 s. */
export async function signAssertion(sub: string, uid: string, privateKey: Key, now = new Date()): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({ uid })
    .setProtectedHeader({ alg: "EdDSA", typ: "JWT" })
    .setIssuer(ASSERTION_ISSUER)
    .setAudience(ASSERTION_AUDIENCE)
    .setSubject(sub)
    .setJti(randomBytes(16).toString("base64url"))
    .setIssuedAt(iat)
    .setExpirationTime(iat + ASSERTION_TTL_SECONDS)
    .sign(privateKey);
}

export const RESUME_TYP = "hub-handoff-resume";
export const RESUME_TTL_SECONDS = 600;

const resumeKeys = new Map<string, Uint8Array>();

/**
 * The resume cookie's HS256 key: HKDF-SHA256(AUTH_SECRET, salt "", info "hub-oidc-handoff-resume-v1", 32 bytes), so it is
 * separate from Auth.js's own use of the secret and rotates with it. No new env var. Derived once per secret.
 * Throws when there is no secret: the hand-off then fails closed rather than signing with a made-up key.
 */
export function resumeKey(env: Env = process.env): Uint8Array {
  const secret = env.AUTH_SECRET || env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required for the OIDC hand-off resume cookie");
  let key = resumeKeys.get(secret);
  if (!key) {
    key = new Uint8Array(hkdfSync("sha256", secret, "", "hub-oidc-handoff-resume-v1", 32));
    resumeKeys.set(secret, key);
  }
  return key;
}

/** The resume cookie value: a compact HS256 JWS carrying the interaction `uid`, valid for 600 s. */
export async function signResume(uid: string, key: Uint8Array, now = new Date()): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({ uid })
    .setProtectedHeader({ alg: "HS256", typ: RESUME_TYP })
    .setIssuedAt(iat)
    .setExpirationTime(iat + RESUME_TTL_SECONDS)
    .sign(key);
}

/** The `uid` of a valid resume cookie, or null for anything else. Never throws. */
export async function verifyResume(token: string, key: Uint8Array, now = new Date()): Promise<{ uid: string } | null> {
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"],
      typ: RESUME_TYP,
      requiredClaims: ["uid", "iat", "exp"],
      currentDate: now,
    });
    if (typeof payload.uid !== "string" || !UID_RE.test(payload.uid)) return null;
    if ((payload.exp as number) - (payload.iat as number) > RESUME_TTL_SECONDS) return null;
    return { uid: payload.uid };
  } catch {
    return null;
  }
}

/** `__Host-` (so sibling *.asafarim.com apps can't set or toss it) when secure; plain on local http. */
export function resumeCookieName(secure: boolean): string {
  return secure ? "__Host-hub_handoff" : "hub_handoff";
}

/** Set-Cookie header for the resume cookie: Path=/, HttpOnly, SameSite=Lax, Max-Age=600, Secure when secure. */
export function resumeSetCookie(value: string, secure: boolean): string {
  return `${resumeCookieName(secure)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${RESUME_TTL_SECONDS}${secure ? "; Secure" : ""}`;
}

/** Set-Cookie header that removes the resume cookie. */
export function resumeClearCookie(secure: boolean): string {
  return `${resumeCookieName(secure)}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

/** One cookie's value from a `Cookie` request header. */
export function readCookie(header: string | null, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

/** Where "Try again" sends the person: the identity service's own start of the hand-off for this interaction. */
export function restartTarget(identityIssuer: string, uid: string): string {
  return `${identityIssuer}/interaction/${encodeURIComponent(uid)}`;
}

/** Where the assertion is posted. Exactly <issuer>/interaction/<uid>/hub. */
export function assertionTarget(identityIssuer: string, uid: string): string {
  return `${identityIssuer}/interaction/${encodeURIComponent(uid)}/hub`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const STYLE = `
:root{color-scheme:light dark;--bg:#f6f4ef;--card:#fff;--ink:#1d1b16;--muted:#5d584d;--accent:#9f4a07;--line:#e4dfd3}
@media (prefers-color-scheme:dark){:root{--bg:#15130f;--card:#1f1c17;--ink:#f1ece2;--muted:#b3ab9b;--accent:#e08a3c;--line:#37322a}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);
font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:16px}
main{max-width:440px;width:100%;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:28px}
.brand{font-weight:700;color:var(--accent);margin:0 0 18px}h1{font-size:1.3rem;margin:0 0 8px}p{margin:0 0 16px;color:var(--muted)}
button{border:0;border-radius:10px;background:var(--accent);color:#fff;font:inherit;font-weight:600;padding:10px 16px;cursor:pointer}
code{font-size:.85em;color:var(--muted)}a{color:var(--accent);font-weight:600}`;

function page(title: string, body: string, extraHead = ""): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><meta name="referrer" content="no-referrer">${extraHead}<title>${escapeHtml(title)} · ASafariM</title>
<style>${STYLE}</style></head><body><main><p class="brand">ASafariM</p>${body}</main></body></html>`;
}

/** The page's only script: submit the hand-off form. Its hash is in the CSP. */
export const SUBMIT_SCRIPT = 'document.getElementById("handoff").submit();';
export const SUBMIT_SCRIPT_HASH = `'sha256-${createHash("sha256").update(SUBMIT_SCRIPT).digest("base64")}'`;

/**
 * The assertion page's own strict CSP (#794). Hub has no CSP today; a future
 * site-wide one must not silently break sign-in, and the page that carries a
 * signed assertion should run only its submit script and post only to the
 * identity service's origin.
 */
export function assertionPageCsp(identityIssuer: string): string {
  const origin = new URL(identityIssuer).origin;
  return [
    "default-src 'none'",
    `script-src ${SUBMIT_SCRIPT_HASH}`,
    "style-src 'unsafe-inline'",
    `form-action ${origin}`,
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** CSP for the hand-off's error and "not enabled" pages: no script, no forms. */
export const HANDOFF_ERROR_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'";

/**
 * The auto-submitted POST back to the identity service. The assertion is a
 * form field, never in a URL. With JavaScript the form submits itself; without
 * it, the person presses the button.
 */
export function assertionPage(target: string, assertion: string): string {
  return page(
    "Signing you in",
    `<h1>Signing you in…</h1><p>Taking you back to the app.</p>
<form id="handoff" method="post" action="${escapeHtml(target)}">
<input type="hidden" name="assertion" value="${escapeHtml(assertion)}">
<noscript><p>JavaScript is off: continue manually.</p></noscript>
<button type="submit">Continue</button></form>
<script>${SUBMIT_SCRIPT}</script>`,
  );
}

/**
 * The hand-off's error page. `action` is a plain link, never a form: the error page's CSP stays `form-action 'none'`.
 */
export function handoffErrorPage(opts: { title: string; message: string; code: string; action?: { href: string; label: string } }): string {
  const action = opts.action ? `<p><a href="${escapeHtml(opts.action.href)}">${escapeHtml(opts.action.label)}</a></p>` : "";
  return page(
    opts.title,
    `<h1>${escapeHtml(opts.title)}</h1><p>${escapeHtml(opts.message)}</p><p><code>${escapeHtml(opts.code)}</code></p>${action}
<p>Go back to the app and start signing in again.</p>`,
  );
}
