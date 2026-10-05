# infra/edge: the shared edge gateway (#770)

One Caddy that will own ports 80/443 for **every** stack on the host (asafarim-com, asafarim-be, later asafarim-os). It's its own compose project (`edge`, deployed to `/var/repos/edge`). The config is `import sites/*.caddy`, and each stack owns exactly one site file, published with `scripts/edge-deploy-site.sh` (validate the whole config → swap → reload → verify, under one lock).

- Phase 1 (#774): the project, the deploy script and its tests.
- Phase 2 (#791): `edge_net` and the site files are installed by every asafarim-com deploy, with **no port change**. `scripts/edge-config.test.mjs` keeps `sites/asafarim-com.caddy` routing exactly what `infra/caddy/Caddyfile` routes today.
- Phase 3 (needs the owner's go-ahead): the cutover. Stop `asafarim-com-caddy-1` **before** `docker compose -p edge up`, because the two share the certificate volumes.

## The `edge_net` rule

`edge_net` is shared **across stacks**. Every container on it can reach every other member's ports **directly, without going through Caddy**, so gateway rules (the `/internal/*` 404, any future `forward_auth`) don't apply on that path.

1. **Joining `edge_net` means being reachable by every other member.** Only public-facing services join: the ones a site file proxies to.
2. **No service may rely on the gateway to authenticate its internal endpoints.** Internal endpoints protect themselves: a token, an HMAC, or a separate private network (like Testora's runner protocol on `testora_control`).
3. **Databases, caches, workers, migrators and runners never join.** They stay on their stack's private network.
4. **Upstream names are shared** (the edge resolves `web`, `hub`, … on `edge_net`). A new stack must not reuse another stack's service names: prefix them or give them unique aliases.

`scripts/edge-net.test.mjs` enforces 1 and 3 for this repository's compose file. Every service on `edge_net` must be on an explicit allow-list with a reason, and nothing on the never-join list may appear. Adding a service to `edge_net` means adding it to that list in the same PR, where review sees it.

### `identity_db`: a second shared network, not part of the edge

`identity_db` links this stack's `postgres` (alias `platform-postgres`) to asafarim-os's `identity` service, which reads the platform database read-only as the `identity_ro` role. `vps-deploy.sh` creates it (`ensure_identity_db_net`) before the **first** `compose up`, because `postgres` joins it and a missing external network fails the whole deploy. Only those two containers join it, and Postgres still never joins `edge_net`. `scripts/edge-net.test.mjs` enforces that `postgres` is the only service of this stack on `identity_db`, and that the network is created before the first `up`.
