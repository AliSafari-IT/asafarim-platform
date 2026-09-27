# AI Workbench runbook

Operations for the public AI tools at `asafarim.com/tools`. Security background:
[threat-model.md](./threat-model.md). Execution details: [execution-boundary.md](./execution-boundary.md).

## Configuration

| Setting | Where | Default | Effect |
| --- | --- | --- | --- |
| `AI_TOOLS_MODE` | env | `off` | `off`: examples only. `fixture`: every run answered by the deterministic fixture (dev, CI, E2E). `live`: provider calls allowed if everything below agrees. |
| `AI_TOOLS_KILL_SWITCH` | env | unset | `1` stops all live calls without touching the database. |
| `web.aiTools.liveEnabled` | Admin setting | `false` | Global live switch. |
| `web.aiTools.disabledTools` | Admin setting | `[]` | Slugs to pause (`tool_paused`); pages stay up. |
| `ai.anthropic.apiKey` / `ANTHROPIC_API_KEY` | Admin setting / env | — | Provider key; Admin wins. Server-only. |
| `AI_TOOLS_ANTHROPIC_MODEL` | env | `claude-opus-5` | Must be priced in `lib/tools/server/pricing.ts` or live is refused. |
| `AI_TOOLS_REQUESTS_PER_5_MIN` | env | `120` | Per-client requests (every POST). |
| `AI_TOOLS_RUNS_PER_TOOL_PER_10_MIN` | env | `10` | Per-client live runs per tool. |
| `AI_TOOLS_RUNS_PER_HOUR` | env | `30` | Per-client live runs across tools. |
| `AI_TOOLS_MAX_CONCURRENT` | env | `4` | Live provider calls in flight, all clients. |
| `AI_TOOLS_DAILY_BUDGET_USD` | env | `5` | Worst-case spend reserved per UTC day before new live runs get `quota_exceeded`. |

Malformed limit values fall back to the defaults, so a typo never removes a limit. Env
changes go through `.env.production.age` (see `docs/environment-management.md`); editing
`.env.production` on the server is overwritten on the next decrypt.

## Emergency stop

Use this for a cost spike, abuse, a quality regression, or a suspected data leak. Pages,
examples, and the catalogue stay up in every case.

1. **One tool:** in Admin, add the slug to `web.aiTools.disabledTools`. Takes effect on the
   next request.
2. **All live calls, fast:** in Admin, set `web.aiTools.liveEnabled` to `false`.
3. **All live calls, database down or Admin unreachable:** set `AI_TOOLS_KILL_SWITCH=1` in
   the encrypted production env and redeploy the `web` service (or on the VPS,
   `docker compose -f docker-compose.prod.yml up -d web` after decrypting).
4. **Provider key compromised:** revoke it in the Anthropic console first, then do step 2 and
   rotate the key in Admin.
5. Confirm: a live run on `/tools/<slug>` returns "Live generation isn't available" or
   "Live runs are paused", and the example still runs.
6. Record what happened, the time, and the switch used in the incident notes, and review the
   threat model if a new abuse path was involved.

### Kill-switch drill

Before marking any tool beta, and quarterly after that: in production, pause one tool via
`web.aiTools.disabledTools`, confirm step 5, then clear it. Note the date here:

| Date | Tool | Result |
| --- | --- | --- |
| — | — | — |

## Owners and response

| Signal | First response |
| --- | --- |
| Cost spike (daily reservation near `AI_TOOLS_DAILY_BUDGET_USD`, or ledger totals jump) | Step 2 above, then check the cost ledger by `operation` (tool slug) and `outcome`. |
| Abuse (many `rate_limited`, unusual traffic) | Lower the per-client limits via env; step 1 for the targeted tool. |
| Quality regression (degraded rate rises, reports of fabricated content) | Pause the tool (step 1); run `pnpm bench:ai-tools` and the opt-in live eval against the same model. |
| Suspected data leak | Step 2; check stdout logs and the cost ledger contain no content (they're built not to); review recent changes to logging and analytics. |

Owner: the platform maintainer (contact@asafarim.com).
