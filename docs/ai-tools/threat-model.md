# AI Workbench threat model

Part of [#680](https://github.com/AliSafari-IT/asafarim-platform/issues/680). Covers anonymous public AI
execution at `asafarim.com/tools`: the three MVP tools, the server execution boundary
([execution-boundary.md](./execution-boundary.md)), and their exports. Review it whenever a tool, a
retention rule, a provider, or the deployment topology changes.

## Assets

| Asset | Why it matters |
| --- | --- |
| Visitor text and results | May contain personal data or secrets despite the warnings. |
| Provider key (`ANTHROPIC_API_KEY` / Admin `ai.anthropic.apiKey`) | Spend and account abuse. |
| Provider budget | Anonymous callers can spend real money. |
| Site availability | Explanatory and catalogue pages must stay up when AI is off. |
| Destination apps (Testora, TasksAI, TimelineAI) | Must never be mutated by an anonymous Web session. |
| Portfolio credibility | Output that fabricates facts, dates, owners, or test results. |

## Actors

- **Visitor**: anonymous, trusted with nothing, including text they paste on someone else's behalf.
- **Abuser**: scripts floods, oversized inputs, key or budget exhaustion, or CSRF through a visitor's browser.
- **Prompt injector**: hides instructions in pasted text, hoping the model ignores the rules or leaks them.
- **Provider**: can be slow, fail, refuse, return malformed or oversized output, or under-report usage.
- **Operator**: can switch tools and live generation off without a deploy.

## Trust boundaries and data flow

```
Browser ──JSON POST (same-origin)──▶ Caddy ──▶ web: /api/tools/<slug>/run
                                                  │ admission (hashed client id, in memory)
                                                  │ idempotency (input hash + envelope, in memory ≤ 2 min)
                                                  │ adapter: schema, prompt with fenced data
                                                  ├──▶ Anthropic API (live only; text leaves our infra)
                                                  │ post-call validation (schema + domain checks)
                                                  ├──▶ cost ledger (Postgres): counts, cost, versions; no text
                                                  └──▶ stdout log: closed set of operational fields; no text
Browser ◀── envelope (result) ── rendered as text; exports built in the browser
```

| Data | Where | Retention |
| --- | --- | --- |
| Pasted text | Request memory; prompt to Anthropic in live mode | Not stored. Anthropic processes it under its API terms. |
| Result | Idempotency store (process memory) | At most 2 minutes, for replay after a dropped response. |
| Input hash (SHA-256) | Idempotency store | At most 2 minutes. |
| Client id (salted SHA-256 of the IP; per-process salt) | Admission controller (process memory) | At most an hour after the client's last request. |
| Cost event (tool, version, outcome, tokens, estimated cost, latency, model) | Postgres cost ledger | As for all cost events (reconciliation). No text, no client id. |
| Operational log line (closed field set) | Container stdout | Container log rotation. No text, no client id. |
| Analytics events (#682) | Umami | Allowlisted low-cardinality properties only. |
| Downloads | Visitor's browser | Never uploaded. |

## Abuse cases and mitigations

| # | Threat | Mitigation | Evidence |
| --- | --- | --- | --- |
| T1 | Prompt injection overrides the rules | User text only in the user turn, fenced as data; fence-closing tags neutralized; system prompt states data ≠ instructions; structured output; **server-side domain checks** drop claims the input doesn't support (fake test results, invented owners or deadlines, normalized dates) | Adapter prompt tests; `security.test.tsx`; eval gate injection cases and canned "followed the injection" responses |
| T2 | Oversized or repeated input exhausts spend or memory | Body capped at 64 KB before reading (Content-Length and streamed); per-tool input byte and character caps; output byte and token caps; timeout; worst-case cost ceiling per run; idempotency (one spend per logical run) | `route.test.ts`, `execute.test.ts`, adapter budget tests |
| T3 | Floods and automated abuse | Per-client request rate (every POST); per-client per-tool and per-client live-run rates; one in-flight live call per client; global concurrency cap; daily spend reservation; env-tunable, malformed values fall back to defaults | `admission.test.ts`, `route.test.ts` |
| T4 | Rate-limit bypass via spoofed `X-Forwarded-For` | The web container publishes no ports; Caddy replaces any client-sent `X-Forwarded-For`, and we use its rightmost entry. No header means one shared restrictive bucket | `admission.test.ts` (client identity) |
| T5 | Raw content leaks through logs, cost events, errors, cache keys | Logger accepts a closed typed field set; cost events carry counts only; errors are fixed UI-safe strings; dedup key is a SHA-256 hash; unhandled errors log no detail | `security.test.tsx` canary test for every tool (fixture and live, model echoing the canary); `execute.test.ts` logging test |
| T6 | Cross-user leakage via cache or handoff | Idempotency entries are keyed by a client-minted random key **and** the input hash; a different input under the same key is a conflict, never a replay; no shared result cache; handoffs are file-based (#678) | `execute.test.ts` idempotency tests |
| T7 | Output rendered as HTML or script | React renders all output as text; the only `dangerouslySetInnerHTML` is the JSON-LD built from our own catalogue with `<` escaped (#681); links in results point only at in-page anchors; Markdown exports escape markup and link syntax | `security.test.tsx` (hostile strings in every editor and export) |
| T8 | CSRF spends a visitor's allowance from another site | Only `application/json` (forces a preflight the route never answers); `Origin` must match the host; `Sec-Fetch-Site` must be same-origin | `admission.test.ts`, `route.test.ts` |
| T9 | Provider outage, slowness, invalid output, partial usage, runaway retries | SDK retries off; browser retries once only on a network failure with the same idempotency key; timeouts abort the call and record an unknown-cost attempt; invalid, oversized, or refused output returns no result; unknown cost keeps the full reservation against the daily budget | `execute.test.ts`, `server-runner` behaviour |
| T10 | PII or secrets pasted despite warnings | Warning next to every input; tool-specific privacy statement; nothing stored; prompt-injection guards don't make PII safe, so the residual risk is stated | Shell and workbench copy tests |
| T11 | Key exposure | Keys only in server env or Admin settings; never in the catalogue, envelope, logs, or client bundle; `server-only` guards on server modules | `security.test.tsx` (key canary), `server-only` imports |
| T12 | Anonymous mutation of destination apps | No write path from Web to Testora, TasksAI, or TimelineAI; handoff is a download plus an import the signed-in user confirms in the destination (#678) | handoff docs and tests |

## Kill switches and failure behaviour

Most restrictive wins, and every failure mode leaves explanatory pages and examples working:

1. `AI_TOOLS_KILL_SWITCH=1`: stops all live calls; doesn't need the database.
2. Admin setting `web.aiTools.liveEnabled=false`: global live off (the default).
3. Admin setting `web.aiTools.disabledTools=[slug]`: pauses one tool (`tool_paused`).
4. Catalogue `lifecycle: "paused"` or `liveGeneration: false`: a code-level switch.
5. Settings unreadable, key missing, model unpriced, limiter error: live **fails closed**.

A fixture result is always labelled as a prepared example and never presented as a live result.

## Accepted residual risks

- **R1** Pasted personal data reaches Anthropic in live mode. Minimized by warnings and no retention on our side; it can't be eliminated for a text-in tool.
- **R2** Text-based guards (owners, deadlines, execution claims) are heuristics. A cleverly worded claim can slip through; the review UI labels every item's provenance so a person decides.
- **R3** Limits and the daily budget are per process and reset on restart. A restart mid-day can allow up to one extra day's budget. Acceptable at one replica; see R4.
- **R4** In-memory limiter and idempotency assume one web replica. Scaling out requires a shared store (Redis) before enabling live generation on more than one instance.
- **R5** A distributed flood from many IPs is limited only by the global concurrency cap and daily budget, which protect cost, not availability for honest users.

## Emergency procedure

See [runbook.md](./runbook.md#emergency-stop).
