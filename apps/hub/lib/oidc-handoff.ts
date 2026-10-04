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
 */
import { createHash, randomBytes } from "node:crypto";
import { SignJWT, errors as joseErrors, importJWK, jwtVerify, type CryptoKey, type JWK, type KeyObject } from "jose";

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

export class TicketError extends Error {
  readonly code: TicketFailure;
  constructor(code: TicketFailure) {
    super(code);
    this.name = "TicketError";
    this.code = code;
  }
}

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

/** Verify the identity service's ticket; returns the interaction uid. */
export async function verifyTicket(ticket: string, publicKey: Key, now = new Date()): Promise<{ uid: string; nonce: string }> {
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
    if (err instanceof joseErrors.JWTExpired) throw new TicketError("expired");
    if (err instanceof joseErrors.JWSSignatureVerificationFailed) throw new TicketError("bad_signature");
    if (err instanceof joseErrors.JWTClaimValidationFailed && err.claim === "aud") throw new TicketError("wrong_audience");
    throw new TicketError("invalid");
  }
  if (typeof payload.nonce !== "string" || payload.nonce.length < 16) throw new TicketError("missing_nonce");
  if (typeof payload.uid !== "string" || !/^[\w-]{1,128}$/.test(payload.uid)) throw new TicketError("invalid");
  if ((payload.exp as number) - (payload.iat as number) > TICKET_MAX_TTL_SECONDS) throw new TicketError("invalid");
  return { uid: payload.uid, nonce: payload.nonce };
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
code{font-size:.85em;color:var(--muted)}`;

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

export function handoffErrorPage(opts: { title: string; message: string; code: string }): string {
  return page(
    opts.title,
    `<h1>${escapeHtml(opts.title)}</h1><p>${escapeHtml(opts.message)}</p><p><code>${escapeHtml(opts.code)}</code></p>
<p>Go back to the app and start signing in again.</p>`,
  );
}
