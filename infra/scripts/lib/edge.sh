#!/usr/bin/env bash
# Shared edge (#770), phase 2: wiring with NO port change. Sourced by
# vps-deploy.sh. Until the cutover the asafarim-com Caddy still owns 80/443 and
# serves infra/caddy/Caddyfile; these steps only prepare the edge:
#
#   ensure_edge_net      create the shared edge_net network (idempotent). Must
#                        run before `compose up`: the public services join it.
#   ensure_identity_db_net create the identity_db network (idempotent): the private
#                        link between the platform's Postgres and asafarim-os's
#                        identity service. Created --internal (isolated from
#                        external networks; no default route through it). Must
#                        run before the FIRST `compose up` (postgres joins it,
#                        and an external network that is missing fails the
#                        whole deploy). An existing network that is NOT internal
#                        aborts the deploy: reusing it would silently drop the
#                        isolation.
#   install_edge_project copy infra/edge (compose file, Caddyfile, static pages,
#                        scripts) to EDGE_DIR, under the edge's deploy lock.
#                        Never touches sites/ except to seed asafarim-be.caddy
#                        once (that stack has no deploy hook of its own yet).
#   publish_edge_site    edge-deploy-site.sh asafarim-com: validate the WHOLE
#                        edge config with this release's site file, install it,
#                        and (only once an edge container runs) reload + verify.
#
# Expects REPO_DIR (the checkout). EDGE_DIR defaults to /var/repos/edge.

EDGE_DIR="${EDGE_DIR:-/var/repos/edge}"

ensure_edge_net() {
  if ! docker network inspect edge_net >/dev/null 2>&1; then
    docker network create edge_net >/dev/null
    echo "edge: created network edge_net"
  fi
}

# identity_db carries only the platform's Postgres (alias platform-postgres) and
# asafarim-os's identity container; nothing else joins it, and it is not edge_net.
ensure_identity_db_net() {
  if docker network inspect identity_db >/dev/null 2>&1; then
    # An existing network is reused only if it is internal: Compose would attach
    # Postgres to a non-internal one without complaint.
    if [[ "$(docker network inspect identity_db --format '{{.Internal}}')" != "true" ]]; then
      echo "identity: identity_db exists but is not internal. Stop the containers attached to it, remove it, recreate it with 'docker network create --internal identity_db', then rerun the deploy." >&2
      return 1
    fi
  else
    # --internal isolates the network from external networks: no default route
    # through it, so no internet. Containers can still reach its gateway IP and
    # the host can reach container IPs; the isolation is from the outside, not
    # from the host.
    docker network create --internal identity_db >/dev/null
    echo "identity: created network identity_db"
  fi
}

install_edge_project() {
  local src="${REPO_DIR}/infra/edge"
  mkdir -p "${EDGE_DIR}/caddy/sites" "${EDGE_DIR}/scripts"
  (
    # The same lock edge-deploy-site.sh holds: never change files under a
    # publish that is validating them.
    exec 9>"${EDGE_DIR}/.deploy.lock"
    flock -w "${EDGE_LOCK_WAIT_SECONDS:-300}" 9 || { echo "edge: deploy lock busy — project files not updated" >&2; exit 75; }
    cp "${src}/docker-compose.yml" "${EDGE_DIR}/docker-compose.yml"
    cp "${src}/caddy/Caddyfile" "${EDGE_DIR}/caddy/Caddyfile"
    rm -rf "${EDGE_DIR}/caddy/static.next"
    cp -R "${src}/caddy/static" "${EDGE_DIR}/caddy/static.next"
    rm -rf "${EDGE_DIR}/caddy/static.prev"
    if [[ -d "${EDGE_DIR}/caddy/static" ]]; then mv "${EDGE_DIR}/caddy/static" "${EDGE_DIR}/caddy/static.prev"; fi
    mv "${EDGE_DIR}/caddy/static.next" "${EDGE_DIR}/caddy/static"
    rm -rf "${EDGE_DIR}/caddy/static.prev"
    cp "${src}/scripts/edge-deploy-site.sh" "${EDGE_DIR}/scripts/edge-deploy-site.sh"
    chmod +x "${EDGE_DIR}/scripts/edge-deploy-site.sh"
    # asafarim.be has no deploy hook yet: seed its file once, never overwrite it.
    if [[ ! -f "${EDGE_DIR}/caddy/sites/asafarim-be.caddy" ]]; then
      cp "${src}/caddy/sites/asafarim-be.caddy" "${EDGE_DIR}/caddy/sites/asafarim-be.caddy"
      echo "edge: seeded sites/asafarim-be.caddy"
    fi
  )
}

publish_edge_site() {
  EDGE_DIR="$EDGE_DIR" bash "${REPO_DIR}/infra/edge/scripts/edge-deploy-site.sh" \
    asafarim-com "${REPO_DIR}/infra/edge/caddy/sites/asafarim-com.caddy"
}
