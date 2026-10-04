/**
 * Test-only stand-in for the ASafariM OS identity service, for Hub's hand-off E2E (#803).
 * It implements the contract in asafarim-os core/identity/README.md, "Login hand-off (ADR 0002, A2)", with one
 * switch: how the assertion POST is answered.
 *
 *   mode "page"      200 + <meta refresh> → /interaction/<uid>/complete → 303 → the fake app   (the contract)
 *   mode "redirect"  303 → /interaction/<uid>/complete → 303 → the fake app                    (must be BLOCKED)
 *
 * Two listeners, because the app must be a different origin from the identity service, as in production:
 *   identity  http://localhost:<E2E_IDENTITY_PORT, 3901>
 *   fake app  http://127.0.0.1:<E2E_APP_PORT, 3902>
 *
 * Keys come from the environment (generated per run by playwright.config.ts); nothing is committed.
 */
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { randomBytes } from "node:crypto";
import { SignJWT, importJWK, jwtVerify, type JWK } from "jose";

const IDENTITY_PORT = Number(process.env.E2E_IDENTITY_PORT ?? 3901);
const APP_PORT = Number(process.env.E2E_APP_PORT ?? 3902);
const HUB_URL = process.env.E2E_HUB_URL ?? "http://localhost:3001";
const IDENTITY_ORIGIN = `http://localhost:${IDENTITY_PORT}`;
const APP_ORIGIN = `http://127.0.0.1:${APP_PORT}`;

type Mode = "page" | "redirect";
interface Hit {
  method: string;
  path: string;
  /** For POST /hub: the verified assertion's sub. */
  sub?: string;
  /** For /complete: what was answered. */
  status?: number;
}
interface Interaction {
  interactionCookie: string;
  completionCookie?: string;
  sub?: string;
}

let mode: Mode = "page";
let hits: Hit[] = [];
let appHits: string[] = [];
const interactions = new Map<string, Interaction>();
const seenJti = new Set<string>();
/** Test hook: lifetime of the next tickets, in seconds (≤ 120). */
let ticketTtl = 120;

const need = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
};
const keys = Promise.all([
  importJWK(JSON.parse(need("E2E_TICKET_PRIVATE_JWK")) as JWK, "EdDSA"),
  importJWK(JSON.parse(need("E2E_ASSERTION_PUBLIC_JWK")) as JWK, "EdDSA"),
]);

const cookies = (req: IncomingMessage): Record<string, string> =>
  Object.fromEntries(
    (req.headers.cookie ?? "")
      .split(/;\s*/)
      .filter(Boolean)
      .map((c) => [c.slice(0, c.indexOf("=")), c.slice(c.indexOf("=") + 1)])
  );

function send(
  res: ServerResponse,
  status: number,
  body: string,
  headers: Record<string, string | string[]> = {}
) {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  res.end(body);
}
const json = (res: ServerResponse, value: unknown) =>
  send(res, 200, JSON.stringify(value), { "content-type": "application/json" });
const redirect = (
  res: ServerResponse,
  to: string,
  headers: Record<string, string | string[]> = {}
) => send(res, 303, "", { location: to, ...headers });

async function readForm(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return new URLSearchParams(Buffer.concat(chunks).toString());
}

async function ticketFor(uid: string): Promise<string> {
  const [ticketKey] = await keys;
  const iat = Math.floor(Date.now() / 1000);
  return new SignJWT({ uid, nonce: randomBytes(16).toString("base64url") })
    .setProtectedHeader({ alg: "EdDSA", typ: "JWT" })
    .setIssuer("id")
    .setAudience("hub")
    .setIssuedAt(iat)
    .setExpirationTime(iat + ticketTtl)
    .sign(ticketKey);
}

async function handleIdentity(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", IDENTITY_ORIGIN);
  const method = req.method ?? "GET";

  // ── test-only control endpoints ──
  if (url.pathname === "/__mode" && method === "POST") {
    const next = (await readForm(req)).get("mode");
    if (next !== "page" && next !== "redirect")
      return send(res, 400, "mode must be page or redirect");
    mode = next;
    return json(res, { mode });
  }
  // Test hook for #801's slow-sign-in and expired-ticket cases (handoff.spec.ts).
  if (url.pathname === "/__ticket-ttl" && method === "POST") {
    ticketTtl = Math.min(
      120,
      Math.max(1, Number((await readForm(req)).get("seconds")) || 120)
    );
    return json(res, { ticketTtl });
  }
  if (url.pathname === "/__log") return json(res, { mode, hits, appHits });
  if (url.pathname === "/__reset" && method === "POST") {
    mode = "page";
    ticketTtl = 120;
    hits = [];
    appHits = [];
    interactions.clear();
    seenJti.clear();
    return json(res, { ok: true });
  }

  // ── the contract ──
  if (url.pathname === "/start" && method === "GET") {
    const uid = randomBytes(12).toString("base64url");
    const interactionCookie = randomBytes(16).toString("base64url");
    interactions.set(uid, { interactionCookie });
    hits.push({ method, path: "/start" });
    return redirect(
      res,
      `${HUB_URL}/oidc/continue?ticket=${encodeURIComponent(await ticketFor(uid))}`,
      {
        "set-cookie": `_interaction=${interactionCookie}; Path=/interaction/${uid}; HttpOnly; SameSite=Lax`,
      }
    );
  }

  // GET /interaction/<uid>: the identity service's own start of the hand-off for a live interaction. Hub's
  // "Try again" link (an expired ticket) points here: a browser holding the interaction cookie gets a new ticket.
  const restart = /^\/interaction\/([\w-]{1,128})$/.exec(url.pathname);
  if (restart && method === "GET") {
    const restartUid = restart[1]!;
    const live = interactions.get(restartUid);
    hits.push({ method, path: `/interaction/${restartUid}` });
    if (!live || cookies(req)["_interaction"] !== live.interactionCookie)
      return send(res, 400, "interaction_expired");
    return redirect(
      res,
      `${HUB_URL}/oidc/continue?ticket=${encodeURIComponent(await ticketFor(restartUid))}`
    );
  }

  const m = /^\/interaction\/([\w-]{1,128})\/(hub|complete)$/.exec(
    url.pathname
  );
  if (!m) return send(res, 404, "not found");
  const [, uid, step] = m as unknown as [string, string, "hub" | "complete"];
  const interaction = interactions.get(uid);

  if (step === "hub" && method === "POST") {
    const hit: Hit = { method, path: `/interaction/${uid}/hub` };
    hits.push(hit);
    if (!interaction) return send(res, 400, "unknown interaction");
    try {
      const [, assertionKey] = await keys;
      const assertion = (await readForm(req)).get("assertion") ?? "";
      const { payload } = await jwtVerify(assertion, assertionKey, {
        algorithms: ["EdDSA"],
        issuer: "hub",
        audience: "id",
        requiredClaims: ["sub", "uid", "jti", "iat", "exp"],
      });
      if (payload.uid !== uid) throw new Error("uid mismatch");
      if ((payload.exp as number) - (payload.iat as number) > 60)
        throw new Error("assertion lives too long");
      if (seenJti.has(payload.jti as string)) throw new Error("replayed");
      seenJti.add(payload.jti as string);
      interaction.sub = payload.sub as string;
      hit.sub = interaction.sub;
    } catch (err) {
      return send(res, 403, `assertion refused: ${(err as Error).message}`);
    }
    interaction.completionCookie = randomBytes(16).toString("base64url");
    const next = `/interaction/${uid}/complete`;
    const setCookie = `identity_complete=${interaction.completionCookie}; Path=${next}; HttpOnly; SameSite=Lax`;
    if (mode === "redirect")
      return redirect(res, next, { "set-cookie": setCookie });
    return send(
      res,
      200,
      `<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${next}"><title>Signing you in</title><p><a href="${next}">Continue</a></p>`,
      {
        "set-cookie": setCookie,
        "content-security-policy":
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'none'",
      }
    );
  }

  if (step === "complete" && method === "GET") {
    const c = cookies(req);
    const ok =
      interaction !== undefined &&
      interaction.completionCookie !== undefined &&
      c["_interaction"] === interaction.interactionCookie &&
      c["identity_complete"] === interaction.completionCookie;
    hits.push({
      method,
      path: `/interaction/${uid}/complete`,
      status: ok ? 303 : 400,
    });
    if (!ok) return send(res, 400, "browser_mismatch");
    return redirect(res, `${APP_ORIGIN}/cb?code=test-${uid}`);
  }
  return send(res, 405, "method not allowed");
}

createServer((req, res) => {
  handleIdentity(req, res).catch((err) => send(res, 500, String(err)));
}).listen(IDENTITY_PORT);

createServer((req, res) => {
  const url = new URL(req.url ?? "/", APP_ORIGIN);
  if (url.pathname === "/cb") {
    appHits.push(url.pathname + url.search);
    return send(res, 200, "<!doctype html><title>app</title>APP OK");
  }
  send(res, 404, "not found");
}).listen(APP_PORT);

console.log(`stub identity on ${IDENTITY_ORIGIN}, fake app on ${APP_ORIGIN}`);
