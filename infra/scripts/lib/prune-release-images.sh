# Shared by vps-deploy.sh and cleanup-docker.sh — sourced, not executed.
#
# Defines prune_superseded_platform_images(), which removes every ASafarIM
# platform image (label com.asafarim.platform=true) except the ones recorded
# in .deploy/current-release and .deploy/previous-release. Callers must `cd`
# to the repo root first so those paths resolve.
#
# If both marker files are missing (e.g. before this pipeline's first
# successful deploy), nothing is excluded and every labeled image becomes a
# removal candidate — but Docker refuses to delete an image still backing a
# running container, so the live release survives regardless.
prune_superseded_platform_images() {
  local keep_current=""
  local keep_previous=""
  local ref
  local -a removable=()

  [[ -f .deploy/current-release ]] && keep_current="$(<.deploy/current-release)"
  [[ -f .deploy/previous-release ]] && keep_previous="$(<.deploy/previous-release)"

  while IFS= read -r ref; do
    [[ -z "$ref" || "$ref" == '<none>:<none>' ]] && continue
    if [[ -n "$keep_current" && "$ref" == *"-${keep_current}" ]]; then
      continue
    fi
    if [[ -n "$keep_previous" && "$ref" == *"-${keep_previous}" ]]; then
      continue
    fi
    removable+=("$ref")
  done < <(docker image ls \
    --filter 'label=com.asafarim.platform=true' \
    --format '{{.Repository}}:{{.Tag}}')

  if (( ${#removable[@]} > 0 )); then
    docker image rm "${removable[@]}" >/dev/null 2>&1 || true
  fi
  docker image prune -f >/dev/null 2>&1 || true
}
