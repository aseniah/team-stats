#!/usr/bin/env bash
# Syncs sprints from Jira, refreshes GitHub reviews and rebuilds the reports for every team.
# Each step runs even if an earlier one failed; exits 1 naming the failed steps.
cd "$(dirname "$0")" || exit 1

bold="" cyan="" red="" reset=""
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  bold=$'\e[1m' cyan=$'\e[36m' red=$'\e[31m' reset=$'\e[0m'
fi

failed=""
step() {
  local title=$1
  shift
  printf '\n%s%s▸ %s%s\n' "$bold" "$cyan" "$title" "$reset"
  node "$@" && return
  failed="${failed:+$failed; }$title"
  return 1
}

step "Sync sprints from Jira" scripts/sync-periods.mjs --from-jira
step "Refresh PR reviews from GitHub" scripts/refresh-pr-reviews.mjs
if step "Build reports" scripts/build-reports.mjs && [ "${1:-}" != "--no-open" ]; then
  ./open.sh
fi

if [ -n "$failed" ]; then
  printf '\n%sFailed steps: %s.%s\n' "$red" "$failed" "$reset" >&2
  exit 1
fi
