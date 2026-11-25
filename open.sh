#!/usr/bin/env bash
# Opens the review leaderboard in the default browser, or the sprint race with `race`.
cd "$(dirname "$0")" || exit 1

case "${1:-}" in
  "") page=reports/pr-reviews.html ;;
  race) page=reports/sprint-race.html ;;
  *)
    echo "Usage: ./open.sh [race]" >&2
    exit 2
    ;;
esac

if [ ! -f "$page" ]; then
  echo "$page is missing. Run ./refresh.sh or node scripts/build-reports.mjs first." >&2
  exit 1
fi

if command -v open >/dev/null 2>&1; then
  open "$page"
else
  xdg-open "$page"
fi
