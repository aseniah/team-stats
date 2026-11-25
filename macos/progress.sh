#!/bin/sh
# Prints "<percent><tab><status>" for a refresh.sh log. Assumes 3 steps; the first two have one line per team.
awk '
/^▸ / { step = $0; sub(/^▸ /, "", step); idx++; n = 0; done = 0; split("", started); split("", fin); next }
/: started$/ { name = $0; sub(/: started$/, "", name); started[++n] = name; if (idx == 1) total = n; next }
/^(✓|✗|–) / { name = $0; sub(/^(✓|✗|–) /, "", name); sub(/: .*/, "", name); fin[name] = 1; done++ }
END {
  if (!idx) { printf "0\tStarting\n"; exit }
  perTeam = total && idx < 3
  pct = int(((idx - 1) + (perTeam ? done / total : 0)) / 3 * 100)
  status = step
  if (perTeam) {
    running = ""
    for (i = 1; i <= n; i++) if (!(started[i] in fin)) running = running (running ? ", " : "") started[i]
    status = status " · " done " of " total " teams" (running ? " · " running : "")
  }
  printf "%d\t%s\n", pct, status
}' "$1"
