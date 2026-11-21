#!/usr/bin/env bash
# Publishes generated proof-board data (changelog, workspace manifest,
# Lighthouse snapshot) to the `proof-data` branch instead of main.
#
# main only accepts changes through a pull request (repository ruleset), so
# the scheduled/bot workflows can't push their regenerated JSON there. The
# showcase reads these files from the proof-data branch on
# raw.githubusercontent.com at request time and falls back to the copies
# committed on main (apps/showcase/app/proof/data.ts).
#
# Usage: scripts/publish-proof-data.sh "<commit message>" <file>...
# Files keep their repo-relative paths on the branch. Each workflow runs in
# its own concurrency group and they write disjoint files, so a push that
# lost a race to the other workflow is rebased and retried.
set -euo pipefail

BRANCH="proof-data"
message="$1"
shift

worktree="$(mktemp -d)"
trap 'git worktree remove --force "$worktree" >/dev/null 2>&1 || true' EXIT

git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"

if git fetch --depth=1 origin "+refs/heads/${BRANCH}:refs/remotes/origin/${BRANCH}" 2>/dev/null; then
  git worktree add --force -B "$BRANCH" "$worktree" "origin/${BRANCH}"
else
  # First publish: the branch holds only the generated files.
  git worktree add --force --orphan -b "$BRANCH" "$worktree"
fi

for file in "$@"; do
  mkdir -p "$worktree/$(dirname "$file")"
  cp "$file" "$worktree/$file"
done

cd "$worktree"
git add -- "$@"
if git diff --cached --quiet; then
  echo "proof-data: nothing changed"
  exit 0
fi
git commit -m "$message"
for attempt in 1 2 3 4; do
  if git push origin "HEAD:refs/heads/${BRANCH}"; then
    exit 0
  fi
  echo "proof-data: push rejected (attempt ${attempt}), rebasing on the latest branch"
  sleep $((attempt * 2))
  git fetch --depth=50 origin "+refs/heads/${BRANCH}:refs/remotes/origin/${BRANCH}"
  git rebase "origin/${BRANCH}"
done
echo "proof-data: could not push after 4 attempts" >&2
exit 1
