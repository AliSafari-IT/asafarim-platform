# Spec: Hub sign-in hand-off — P2.3 readiness (#782)

**Status:** Ready for implementation
**Scope:** Tasks 1–3 from the architecture review of [#792](https://github.com/AliSafari-IT/asafarim-platform/pull/792), [#795](https://github.com/AliSafari-IT/asafarim-platform/pull/795) and [#797](https://github.com/AliSafari-IT/asafarim-platform/pull/797)
**Repos:** `asafarim-platform` (Hub), `asafarim-os` (identity service, `core/identity`)
**Gate:** do not set the three hand-off env vars in production (P2.3) until Tasks 1 and 3 are merged, and the staging smoke test in §5 passes.

The contract this spec builds on is in `asafarim-os/core/identity/README.md`, under *Login hand-off (ADR 0002, A2)*. The rest of this document calls it **the contract**.

---

## 1. Findings that drive this spec

| # | Finding | Evidence | Outcome |
|---|---|---|---|
| H1 | Once the identity service redirects to the app, Chrome refuses the navigation: Hub's `form-action` (#795) rejects the app's origin, so the sign-in never completes. | Chromium 1194 experiment (§1.1). | **Task 1** |
| H2 | A forwarded `/oidc/continue` link could finish someone else's sign-in. | The identity service already guards against this with a two-step completion (completion cookie plus interaction cookie). See contract steps 5–6. | **Not a vulnerability.** Task 2 shrinks to documentation. |
| M1 | Someone who isn't signed in to Hub usually takes longer than the 120 s ticket allows (email code, Google, sign-up) and ends on a dead-end "expired" page. | `oidc-handoff.ts:19`; `route.ts` redirects with the ticket in `callbackUrl`. | **Task 3** |
| M2 | After a password sign-in, `router.push` to `/oidc/continue` runs the route twice: once as a background fetch, then again as a full page load. | `SignInPageContent.tsx:110`. | Folded into **Task 3**, because the resume cookie depends on it. |

### 1.1 The H1 experiment (reproducible)

The test runs three local origins: a fake Hub that sends the same CSP as Hub, a fake identity service and a fake app. The fake Hub auto-submits a form to `id/…/hub`.

| Identity answers the POST with | Result in Chromium |
|---|---|
| `303 → /complete`, then `303 → app` (today's behaviour) | **Blocked.** Console: `Refused to send form data … violates "form-action <id>"`. The browser stays on Hub. The identity service has **already** received `POST /hub` and `GET /complete`, so the pending login is used up and retrying fails. |
| `200` page with `<meta http-equiv=refresh>` to `/complete`, then `303 → app` | **Reaches the app.** `GET /complete` carries both `_interaction` (SameSite=Lax, set earlier) and `identity_complete` (SameSite=Lax, set on the 200 response to the cross-site POST). |

Chromium checks `form-action` on every redirect in the chain a form submission starts. A navigation that a page on the identity origin starts is a new navigation, so the check doesn't apply.

---

## 2. Task 1 — Make the hand-off survive Hub's `form-action` (H1)

### 2.1 Decision

The identity service ends the form-submission navigation with a **200 "hand-on" page**. That page starts a new same-origin navigation to `/interaction/<uid>/complete`. Hub's CSP stays as it is.

**Rejected alternatives**

- *Drop `form-action` from Hub's policy.* It would work, but it removes the guarantee that the page carrying a signed assertion can post only to the identity service. It would also let the identity service drift back to redirects with nothing to catch it.
- *List the client app origins in `form-action`.* Hub doesn't know the client list, and the redirect target is chosen per request.
- *`response_mode=form_post` for every client.* That's an app-by-app change and a bigger contract change.

### 2.2 Identity service changes (`asafarim-os/core/identity/src/provider.ts`, `pages.ts`)

`POST /interaction/:uid/hub`, on success only:

1. Keep everything that happens before the response: the assertion check, the account check, `pending.put`, and the completion cookie with its current attributes.
2. Replace `ctx.status = 303; ctx.redirect(completePath(uid))` with an HTML `200` response:
   - Body: a branded page that says "Signing you in…" and contains:
     - `<meta http-equiv="refresh" content="0;url=/interaction/<uid>/complete">`
     - a visible `<a href="/interaction/<uid>/complete">Continue</a>` fallback
     - no script
   - Escape `uid` in both places. It already matches `[\w-]+` because of the route regex.
   - Headers:
     - `Cache-Control: no-store`
     - `Referrer-Policy: no-referrer`
     - `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`
3. Error responses don't change: they are already `200`/`4xx` pages.

Update the contract text in step 5: "…and answers `200` with a page that navigates to that path (not a redirect: Hub's `form-action` would block a redirect chain that reaches the client's origin)."

### 2.3 Hub changes

There are no code changes in Hub. Add tests only:

- **`apps/hub/e2e/handoff-csp.spec.ts`** (new, Playwright, Chromium, run with `executablePath` from `PLAYWRIGHT_BROWSERS_PATH`)
  - Start the real `/oidc/continue` handler, or a Next dev server with the hand-off env set to test keys, plus two `node:http` stubs:
    - a fake identity service that follows the contract (200 hand-on page, then 303 to the app)
    - a fake app
  - Assert the browser ends on the fake app's callback.
  - Second case: point the stub at the old behaviour (303 chain). Assert the browser **does not** reach the app. This is the canary that explains the first case if the policy ever changes.
- Add `"e2e": "playwright test"` to `apps/hub/package.json`, and add the job to CI the same way the existing app E2E jobs are wired.

### 2.4 Acceptance criteria

- [ ] In `asafarim-os`, a Playwright test (alongside `apps/notes/e2e`) runs a fake Hub page that sends Hub's **exact** CSP string, copied from `assertionPageCsp`, through the real identity routes. It ends on the client `redirect_uri` with a `code`.
- [ ] The `asafarim-os` unit tests for `POST /hub` assert `200`, the meta refresh target, the completion cookie, and no `Location` header.
- [ ] The Hub E2E in §2.3 passes in CI. The canary case fails to reach the app.
- [ ] The contract README is updated (step 5).

### 2.5 Order

`asafarim-os` merges first. Hub's tests use a stub, so they don't depend on it, but the staging smoke test (§5) does.

---

## 3. Task 2 — Record the cross-site guarantee in Hub (H2, re-scoped)

The identity service already makes it safe for Hub to auto-submit: completion needs both the starting browser's interaction cookie and the posting browser's completion cookie. Hub's code doesn't say this, and the next reviewer will raise it again, as this review did.

### 3.1 Changes

- `apps/hub/lib/oidc-handoff.ts`, header comment:
  - Add a paragraph explaining why auto-submit is safe, pointing to contract steps 5–6.
  - State that Hub must never treat a successful POST as "signed in at the app". Completion happens only at the identity service.
- `nonce`: **keep requiring it in the ticket; don't copy it into the assertion.** The identity service stores no nonce to compare against, so copying it would add a claim that nothing checks. Say so in the comment:

  > the ticket's nonce makes each ticket unique; binding is done by the identity service's completion step, not by the nonce.

- `apps/hub/app/oidc/continue/route.ts`, order comment (step 5): change "auto-submitted POST" to "auto-submitted POST; the identity service finishes the sign-in only in the browser that started it".

### 3.2 Acceptance criteria

- [ ] Comment-only diff. `pnpm --filter @asafarim/hub lint typecheck test` stays green.
- [ ] Reviewed by the owner of `core/identity`, so both sides describe the same guarantee.

This can ride in the same PR as Task 3.

---

## 4. Task 3 — Survive a slow sign-in: resume cookie and full navigation (M1, M2)

### 4.1 Decision

After checking a ticket, Hub stores what it needs in a **short-lived signed cookie** and sends the person to sign in **without the ticket in the URL**. When they come back, Hub resumes from the cookie. The ticket's 120 s limit then only covers the trip from the identity service to Hub. The sign-in itself is bounded by the identity service's interaction lifetime (`ttl.Interaction = 600` s in `provider.ts`).

The second part of the fix: an expired ticket gets a **"Try again"** button that sends the person back to the identity service to get a new ticket, instead of a dead end.

### 4.2 Resume cookie

| Attribute | Value | Why |
|---|---|---|
| Name | `__Host-hub_handoff` | `__Host-` stops sibling `*.asafarim.com` apps from setting or tossing it. Locally, over http, use `hub_handoff` without the prefix. |
| Value | Compact JWS, HS256 | Integrity and expiry. The contents aren't secret: `uid` already appears in identity service URLs. |
| Signing key | `HKDF-SHA256(AUTH_SECRET, salt="", info="hub-oidc-handoff-resume-v1", 32 bytes)` | Separate from Auth.js's own key use. Rotates with `AUTH_SECRET`. |
| Claims | `uid` (the ticket's, already validated), `iat`, `exp = iat + 600`, `typ: "hub-handoff-resume"` | `uid` is all the assertion needs. 600 s matches the identity service's interaction lifetime. |
| `Path` | `/` (required by `__Host-`) | |
| `HttpOnly`, `Secure` (prod), `SameSite=Lax` | | Lax is enough: the person comes back by a top-level GET from Hub's own pages or from Google's redirect. |
| `Max-Age` | `600` | |

Put the helpers in `apps/hub/lib/oidc-handoff.ts`:

- `signResume(uid, key, now)`
- `verifyResume(token, key, now) → { uid } | null` (never throws to the route)
- `resumeCookieName(secure)`

Derive the key once and memoize it.

### 4.3 Route behaviour (`GET /oidc/continue`)

The order of checks is fixed. This replaces steps 2–3 of the current route comment.

| Step | Condition | Response |
|---|---|---|
| 1 | Not configured | 503 "not enabled" (unchanged) |
| 2 | `ticket` param present | Check it. **Invalid** → 400 error page (unchanged codes). **Expired** → 400 with a "Try again" button (§4.4). **Valid** → `uid` = the ticket's `uid`; go to 4. |
| 3 | No `ticket` param | Read and check the resume cookie. Missing or invalid → 400 `handoff_missing` page ("Go back to the app and start signing in again"; no button, because the `uid` is unknown). Valid → `uid` = the cookie's `uid`; go to 4. |
| 4 | No Hub session | Set or refresh the resume cookie for `uid`. Then `303 /sign-in?callbackUrl=/oidc/continue`. **The ticket is never put in `callbackUrl`.** |
| 5 | User missing or inactive | 403 (unchanged). Clear the resume cookie. |
| 6 | OK | Sign the assertion and return the 200 auto-POST page (unchanged). **Don't clear the resume cookie here** (see §4.5). If a ticket was present, also set a resume cookie for `uid`, replacing any older one. |

Notes:

- When a request carries both a ticket and a cookie, the ticket wins. Step 6 overwrites the cookie, so an old `uid` can't come back later.
- The cookie is never used to skip the session check. It only stands in for a ticket.

### 4.4 "Try again" for an expired ticket

`jose` throws `JWTExpired` only **after** the signature checks out, and the error carries `payload`. So `verifyTicket` can return a typed result for this case:

```ts
type TicketResult =
  | { ok: true; uid: string; nonce: string }
  | { ok: false; code: TicketFailure; restartUid?: string };
```

Set `restartUid` **only** for `expired`, and only when:

- `payload.iss === "id"`, `payload.aud` is or includes `"hub"`, and
- `payload.uid` matches `^[\w-]{1,128}$`.

jose's claim-check order is an implementation detail, so check these explicitly. (Verified with jose 6: `JWTExpired.payload` is set for a correctly signed expired token, and a bad signature fails before any payload is exposed.)

The error page then shows a link (not a form, because the error page's CSP is `form-action 'none'`):

`<a href="<identityIssuer>/interaction/<restartUid>">Try again</a>`

That address is the identity service's own start-of-hand-off route. If the interaction is still alive and this browser holds its interaction cookie, the identity service issues a new ticket. Otherwise it shows its own `interaction_expired` page. Hub needs no further logic.

Add `restartUid` to the existing error-page helper as an optional `action: { href, label }`. Escape it the same way.

### 4.5 Sign-in navigation (M2)

Both client-side sign-in paths navigate to `callbackUrl` themselves: the password form in `SignInPageContent.tsx` and the email-code form in `EmailCodeForm.tsx`. Each does `router.push(callbackUrl); router.refresh()` for a relative URL. Add one shared helper, `navigateAfterSignIn(callbackUrl, router)`, in `apps/hub/app/sign-in/_components/`, and use it in both:

- `callbackUrl` starts with `/oidc/` → `window.location.assign(callbackUrl)`. This is a **full document navigation**, with no `router.push` or `router.refresh`.
- any other relative URL → today's `router.push` + `router.refresh`, unchanged.
- an absolute URL → today's `window.location.href`, unchanged.

Google OAuth already returns by a server redirect.

Why both safeguards (full navigation **and** not clearing the cookie in step 6):

- `router.push` makes the route run as a background fetch first. If step 6 cleared the cookie, that fetch would clear it, and the real navigation that follows would land on `handoff_missing`.
- Not clearing the cookie is harmless. A later bare visit can at worst sign an assertion for a finished interaction, which the identity service refuses (`interaction_expired`).

### 4.6 Acceptance criteria

Unit (`apps/hub/lib/oidc-handoff.test.ts`):

- [ ] `signResume` / `verifyResume` round-trip.
- [ ] `verifyResume` refuses an expired token, a tampered token, a token signed with another `AUTH_SECRET`, a wrong `typ` and a bad `uid`, returning `null` without throwing.
- [ ] `verifyTicket` returns `restartUid` for an expired ticket with a good signature, and **not** for a bad signature, a wrong audience or a malformed `uid`.

Route (`apps/hub/app/oidc/continue/route.test.ts`):

- [ ] Ticket + no session → 303 to `/sign-in?callbackUrl=%2Foidc%2Fcontinue`. The `Location` header contains no `ticket`. `Set-Cookie` has the resume cookie with `HttpOnly`, `SameSite=Lax`, `Max-Age=600` and `Path=/`.
- [ ] No ticket + valid cookie + session → assertion page for the cookie's `uid`, and the cookie is not cleared.
- [ ] No ticket + no or invalid cookie → 400 `handoff_missing`, and no assertion.
- [ ] Ticket + cookie for another `uid` → the assertion uses the ticket's `uid`, and the cookie is replaced.
- [ ] Expired ticket → 400 page with exactly one link, to `<issuer>/interaction/<uid>`. The CSP is still the error policy.
- [ ] Inactive user via cookie → 403, and the cookie is cleared.

Sign-in:

- [ ] A unit test for `navigateAfterSignIn`: `/oidc/continue` → `location.assign`, and no router calls; `/dashboard` → `router.push` + `router.refresh`; a trusted absolute URL → `location.href`.
- [ ] Both `SignInPageContent.tsx` and `EmailCodeForm.tsx` call the helper. Grep check: neither calls `router.push(callbackUrl)` directly.

E2E (extends §2.3):

- [ ] A signed-out flow: ticket → sign-in page → wait **150 s** of fake time (or set the stub's ticket lifetime to 2 s) → sign in → reaches the fake app.

### 4.7 Files touched

- `apps/hub/lib/oidc-handoff.ts`: resume helpers, the `verifyTicket` result type, the error-page action.
- `apps/hub/app/oidc/continue/route.ts`: the flow in §4.3.
- `apps/hub/app/sign-in/_components/SignInPageContent.tsx` and `EmailCodeForm.tsx`, plus the new `navigateAfterSignIn` helper: §4.5.
- Tests as listed above.
- No env changes: the key comes from `AUTH_SECRET`.

---

## 5. Staging smoke test (before P2.3 flips production)

Run in Chrome **and** Firefox against staging Hub and staging `id`, with one real client app:

1. Signed in to Hub → open the app → sign in → you land in the app signed in, with no "Continue" click needed.
2. Signed out of Hub → open the app → Hub sign-in with an **email code**, waiting more than 2 minutes before entering it → you land in the app.
3. The same as 2 with Google.
4. Copy a `/oidc/continue?ticket=…` link from browser A (signed out) into browser B (signed in as someone else) → B gets `browser_mismatch` at the identity service, and A is not signed in.
5. Wait more than 2 minutes on a fresh ticket link without signing in, then reload → "Try again" → a new ticket → sign-in continues.
6. Turn JavaScript off → the "Continue" button on Hub, then the "Continue" link on the identity service's hand-on page, complete the sign-in.

Record the results on #782 before setting the env vars.

## 6. Out of scope

- Sign-out end-session (review M3).
- Ticket `maxTokenAge`, clock tolerance and typed `typ` headers (review L1).
- Config memoization and the startup check (L2).
- The view migration notes (L3, L4).
- The `normalizeCallbackUrl` open redirect (tracked separately). Task 3 relies on `/oidc/continue` passing it, which it does today, and the fix must keep it passing.
