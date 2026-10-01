# ADR 0004: Testora runs tests in an isolated runner container

**Status:** Proposed
**Date:** 2026-10-01
**Related:** [#706](https://github.com/AliSafari-IT/asafarim-platform/issues/706) (decision), [#699](https://github.com/AliSafari-IT/asafarim-platform/issues/699) (app-layer target policy), [#702](https://github.com/AliSafari-IT/asafarim-platform/issues/702) (target secrets), [ADR 0002](0002-testora-tasksai-trust-boundary.md) (machine-to-machine auth pattern)

## Context

Testora runs end-to-end tests against websites. A run turns test cases into a
TestCafe spec, starts headless Chromium and drives it against a target such as
`https://tlai.asafarim.com`. Today all of that happens **inside the Next.js
server process** of the `testora` container (`src/app/api/run/route.ts` →
`test-engine/executors/testExecutor.ts`). That is the same process that holds
the database connection, the platform's environment and the in-memory run
state.

Recent work hardened this at the application layer:
- only testers and admins can run tests (#698);
- target URLs pass a network policy (`lib/target-policy.ts`, #699);
- the login scripts follow the run's target (#700);
- tests that change data are skipped on web targets (#701);
- test data only sees its target's own secrets (#702).

Three properties can't be fixed at the application layer while the runner shares the web server's process and network:

1. **Network reach.** The target policy checks a URL once, and the runner looks
   the hostname up again later. In production TestCafe drives Chromium in
   proxy mode, so page traffic and `t.request` leave from the Node process,
   not from Chromium, and browser flags can't constrain them. That process sits
   on `asafarim_net` next to every Postgres, Redis and app container. A request
   that gets past the app-layer check can reach them.
2. **Secret reach.** Scripted cases are code (admin-authored, but still code)
   running in the server process. Per-spec env shadowing (`specEnvPrelude`)
   hides `process.env` from well-behaved scripts. Anything can still reach
   `globalThis.process.env`, which is the whole of `.env.production`, and the
   memory of concurrent runs.
3. **Run durability.** Run state, logs and the queue are in-memory
   (`executors/runLog.ts`, `runScheduler.ts`). A deploy or crash loses
   in-flight and queued runs, and the runner can't scale apart from the web app.

The options considered in #706 were an egress proxy (A), an isolated runner
(B) and a host firewall on the existing container (C).

## Decision

Move test execution out of the web app into a dedicated **`testora-runner`**
service. It holds no platform secrets and no data stores, and its network can
reach the public internet but nothing internal. The web app stays the only
authority. It owns the queue, the database, object storage, target secrets and
every policy decision. The runner is a disposable executor that **pulls** work,
streams events back and stores nothing.

### 1. Topology

```
               asafarim_net (existing)                  testora_control (internal: true)        testora_egress
 ┌──────────────────────────────────────────┐        ┌───────────────────────────────┐      ┌──────────────────┐
 │ caddy  hub  edumatch  …  postgres  redis │        │                               │      │                  │
 │ testora-postgres                         │        │                               │      │                  │
 │            testora (web) ────────────────┼────────┼──► :3000/internal/runner/*    │      │                  │
 └──────────────────────────────────────────┘        │          ▲                    │      │                  │
                                                     │          │ lease / events     │      │                  │
                                                     │   testora-runner ─────────────┼──────┼──► internet only │
                                                     └───────────────────────────────┘      └──────────────────┘
```

- **`testora` (web)** joins `asafarim_net` (unchanged) and a new
  **`testora_control`** network declared `internal: true`, so it has no
  gateway and no internet. Only `testora` and `testora-runner` are on it.
- **`testora-runner`** joins `testora_control` and a new **`testora_egress`**
  bridge network, and **never** `asafarim_net`. It can't resolve or route to
  `testora-postgres`, `redis`, `hub` or any other internal service name.
- **Host-level egress filter on `testora_egress`.** A Docker bridge still
  routes to the host gateway, the host's other interfaces, link-local and the
  provider's metadata address. `infra/scripts/vps-deploy.sh` idempotently installs
  `DOCKER-USER` iptables rules for the `testora_egress` subnet (fixed in compose
  via `ipam`) that:
  - DROP RFC1918, loopback, link-local (`169.254.0.0/16`), CGNAT
    (`100.64.0.0/10`), multicast/reserved, and the host's own bridge gateways;
  - ACCEPT established/related traffic, DNS to the configured resolvers, and everything else (the public internet).

  IPv6 is disabled on `testora_egress` (`enable_ipv6: false`) until there is an
  equivalent `ip6tables` rule set.
- Public ASafariM apps stay reachable the way any internet client reaches them,
  through the VPS public IP and Caddy. That is the intended path for Remote
  targets, including Hub SSO.

Because this filter works on the subnet, it covers everything the container
does: Chromium, the hammerhead proxy, `t.request`, `fetch` and raw sockets in
scripted code. That holds even if the app-layer policy and DNS answers are
wrong. The app-layer policy (#699) stays as the first line, because it gives
users clear errors before a run is queued.

### 2. Control protocol: runner pulls, web decides

The runner opens every connection. The web app never calls into the runner.
All endpoints live under `/internal/runner/*` on the web app. They are reachable
only via `testora_control`: Caddy has no route for `/internal/*`, and the
proxy's `SERVICE_ROUTES` admit them only with the runner token.

| Call | Purpose |
|---|---|
| `POST /internal/runner/lease` | Long-poll (≤ 25 s) for the next job, returning a **job envelope** or 204. |
| `POST /internal/runner/jobs/:id/events` | Batched run-log lines, per-case results and progress. The response carries `{ cancel: boolean }`. |
| `PUT /internal/runner/jobs/:id/artifacts/:kind/:name` | Screenshots, DOM snapshots and videos. Size-capped and content-type allow-listed. The web app writes them to object storage via `@asafarim/storage`. |
| `POST /internal/runner/jobs/:id/complete` | Final status (`passed`, `failed`, `error`, `cancelled`) plus the formatted reports. |

**Authentication.** Every request carries `Authorization: Bearer
<TESTORA_RUNNER_TOKEN>`. Requests with bodies are also signed with HMAC-SHA256
over `${timestamp}.${jobId}.${rawBody}`, with the ±300 s window and
array-of-secrets rotation from [ADR 0002](0002-testora-tasksai-trust-boundary.md).
Each lease returns a per-job **lease token**, valid only for that job's
`events`, `artifacts` and `complete` calls and only until the lease expires.
So a compromised run can't write into another run.

**The job envelope** is everything one run needs, and nothing more:

```jsonc
{
  "jobId": "…", "leaseToken": "…", "leaseExpiresAt": "…",
  "spec": "…generated TestCafe source…",      // built by the web app (testGenerator.ts)
  "env": {                                     // EXACTLY the spec's process.env
    "TESTORA_TARGET_BASE_URL": "…", "TESTORA_TARGET_HUB_URL": "…",
    "TESTORA_TARGET_API_URL": "…", "WEBAPP_API_URL": "…",
    "ASAFARIM_ADMIN_EMAIL": "…", "ASAFARIM_ADMIN_PASSWORD": "…"   // this target's secrets only (#702)
  },
  "allowedOrigins": ["https://tlai.asafarim.com", "https://hub.asafarim.com"],
  "limits": { "timeoutMs": 900000, "maxArtifactBytes": 52428800 },
  "browser": { "flags": ["--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"] }
}
```

The web app generates the spec, so `testGenerator.ts`, the seed bundles and
the target, secret and destructive-fixture policies stay in one place. The
runner gets no catalog, no database rows and no project context beyond what's in the envelope.

### 3. Runner internals: one child process per job

- The runner is a small Node program (`apps/testora/src/runner/main.ts`) with
  a concurrency setting (`TESTORA_RUNNER_CONCURRENCY`, which replaces
  `TESTORA_MAX_CONCURRENT_RUNS`).
- **Each job runs in a fresh child process** started with
  `env: envelope.env + browser vars`. Nothing is inherited from the runner. The
  spec is written to a per-job `tmpfs` directory. When the job ends, the child
  is killed, along with Chromium's process group, and the directory is deleted.
  - Concurrent runs no longer share memory or `process.env`. Scripted code that
    reads `globalThis.process.env` sees its own envelope and nothing else.
  - `specEnvPrelude` stays only for local dev, where the runner still runs
    in-process (see §6).
- `allowedOrigins` is advisory telemetry. The child logs, but doesn't block,
  navigations outside it, so it can be tightened later. The **host filter**
  is the enforcement.
- Hard stops: `limits.timeoutMs`, a cancel flag (returned on any `events` call),
  and lease expiry. If a lease isn't renewed, the web app marks the run `error`
  ("runner lost") and doesn't re-queue it automatically, since a re-run could
  repeat side effects on the target.

### 4. Web side: durable runs

New tables in Testora's Drizzle database replace `runLog.ts` and `runScheduler.ts`:

- `runs(id, project_id, owner_id, target_id, label, status, total, queued_at, started_at, finished_at, lease_owner, lease_expires_at, cancel_requested)`.
- `run_events(run_id, seq, kind, payload, created_at)`, append-only. It feeds the existing SSE stream (`/api/run/stream/:runId`), which now tails the table using `LISTEN/NOTIFY` and doesn't keep memory state.
- Leasing uses `SELECT … FOR UPDATE SKIP LOCKED` on `runs`. The capacity and queue-position UI is computed from the table.

`POST /api/run` keeps its current contract and policy checks. It inserts a
`queued` run plus the frozen envelope (encrypted at rest, since it holds
secrets) and returns 202. Results are persisted by `complete`, exactly as
`runInBackground` does now. Deploying the web app no longer loses runs, and
queued runs survive restarts.

### 5. Hardening of the runner container

- **Image:** a separate `runner-worker` target in `apps/testora/Dockerfile`.
  Node, Chromium, fonts and the runner bundle only, with no Next.js build and no
  workspace secrets. The web `runner` image **drops Chromium**.
- **Compose:**
  - `read_only: true`, `tmpfs: [/tmp, /home/node/.cache]`, `user: node`;
  - `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`;
  - `pids_limit`, `mem_limit` and `cpus` sized to concurrency × one Chromium;
  - `shm_size: 1g`;
  - **no `env_file`**: the only environment is `TESTORA_CONTROL_URL`, `TESTORA_RUNNER_TOKEN`, `TESTORA_RUNNER_CONCURRENCY` and the browser path;
  - `restart: unless-stopped`.
- **Build pipeline:** add the image to `scripts/plan-image-builds.mjs` and
  `docker-bake.hcl` (required for every new image). `vps-deploy.sh` gets the
  network and iptables step, plus a post-deploy self-test (§7).

### 6. Local development

`pnpm --filter testora worker:dev` runs the runner as a host process against
`http://localhost:3005/internal/runner/*`, which keeps Local targets
(`localhost:3010`, …) working. There is no network isolation in dev, which
matches the dev behaviour of the target policy today.
`TESTORA_RUNNER_MODE=inprocess`, the default only while migrating, keeps
today's in-process executor so the cutover can be flipped and rolled back
by config.

### 7. Verification (acceptance for the implementation)

- **Egress self-test**, run by `vps-deploy.sh` and the runner at start-up:
  - from inside `testora-runner`, a TCP connect to each of these must **fail**:
    `testora-postgres:5432`, the `redis` service name, the `asafarim_net`
    gateway, the host bridge gateway, `169.254.169.254:80`, and one RFC1918
    address;
  - an HTTPS GET to the public Hub must **succeed**;
  - the deploy fails if any expectation is wrong.
- **Rebinding test:** a staging target whose DNS alternates public and private
  answers can't fetch the private address. This must hold both for the page and
  for `t.request` in a scripted case.
- **Secrets test:** a scripted case that dumps `globalThis.process.env` into its
  report shows only the envelope keys.
- **Durability test:** restart the `testora` web container mid-queue. Queued runs start afterwards, and the running one finishes or is reported `error` ("runner lost").
- **Parity:** the seeded TimelineAI, Vionto and EduMatch suites pass on Remote
  through the runner, and on Local through `worker:dev`.

## Rollout

1. **Durable runs:** add the `runs` and `run_events` tables and move SSE onto
   them, still executing in-process. This fixes durability on its own and can
   ship alone.
2. **Runner program and protocol:** add `src/runner/`, the `/internal/runner/*`
   routes, the envelope and per-job child processes, behind
   `TESTORA_RUNNER_MODE=remote`. Exercise it in dev via `worker:dev`.
3. **Production topology:** add the image and compose networks, the iptables
   rules and the self-test. Deploy with `TESTORA_RUNNER_MODE=remote`, keeping
   the in-process path available for one release.
4. **Removal:** remove the in-process executor from the web runtime, remove
   Chromium from the web image, and delete `specEnvPrelude`'s shadowing outside
   dev and the deprecated server-env credential fallback (#702).

Each step is one PR and each has its own issue.

## Consequences

**Positive**
- **Network:** the runner's reach is enforced at the network layer, so the app
  layer is no longer the only control. This holds whatever DNS returns or
  however a script makes its requests.
- **Secrets:** a test can only ever see its own job's secrets. The platform's
  `.env.production` is out of reach by construction.
- **Durability:** runs survive deploys, the queue is shared and inspectable,
  and runner capacity scales on its own (more replicas, or later a different
  host).
- **Smaller web image:** the web app drops Chromium, so the image is smaller and has less attack surface.

**Negative / costs**
- One more image, two networks and host firewall rules to own. A firewall
  mistake is silent unless the self-test runs, which is why the self-test is a
  deploy gate.
- **Latency:** queue latency goes from immediate to one long-poll cycle.
  Log streaming goes from in-memory to database round-trips (batched, so this
  is acceptable).
- The envelope stores decrypted target secrets for the lifetime of a queued
  run. It is encrypted at rest and deleted on `complete`.
- **Local targets in production:** inside the runner, `localhost` is the runner
  itself. They stay refused in production, as today.

## Alternatives considered

- **A. Egress proxy plus `runner.useProxy()`.** This covers page traffic only
  if every egress path honours the proxy. `t.request`, `fetch` and sockets in
  scripted code can bypass it. It also does nothing for secret reach or
  durability. Rejected as the end state. It stays a possible stopgap if this
  ADR can't start soon.
- **C. Host firewall on the existing `testora` container.** The web process
  must reach `testora-postgres` and `asafarim_net`, so the rules would have to
  allow exactly the traffic we need to deny. It leaves secrets and durability
  unsolved. Rejected.
- **BullMQ on the platform Redis.** This would put the runner on a network
  with Redis, a shared store, and hand it a connection string. The pull-over-HTTP
  protocol keeps the runner storeless and gives the web app every decision.
  Rejected for this boundary. Vionto and AppBuilder keep BullMQ, because their
  workers are trusted code.
- **A fresh container per run** (Docker-in-Docker or the socket). This gives the
  strongest isolation, but mounting the Docker socket into anything Testora
  controls is worse than the risk it removes. We could revisit it with a
  rootless runtime or a separate host later. A child process per job inside
  one hardened container is the chosen middle ground.

## Open questions

- Hostinger's metadata/link-local services and any host daemons listening on
  `0.0.0.0` need to be inventoried once, so the DROP list and the self-test
  cover them.
- Whether `STORAGE_ENDPOINT` is public. If so, the web app could hand out
  pre-signed PUT URLs instead of proxying artifacts. Proxying is the default
  because it needs no extra egress rule and no storage credentials in the runner.
