const earliest = (times) =>
  times.reduce((a, b) => (Date.parse(a) <= Date.parse(b) ? a : b));

// `periods` is oldest first. `state` is the team's last state.json, or null before its first refresh.
// A state.json from before `coveredFrom` existed counts as covering every period, so it never triggers a backfill.
export function refreshWindow(periods, state, sinceOverride = null) {
  const first = periods[0].start;
  const coveredFrom = state ? (state.coveredFrom ?? first) : null;
  let since = sinceOverride;
  if (!since) {
    const starts = [(periods.at(-2) ?? periods.at(-1)).start];
    if (state?.refreshedAt) {
      const t = Date.parse(state.refreshedAt);
      const containing = periods.findLast((p) => Date.parse(p.start) <= t);
      starts.push(containing ? containing.start : state.refreshedAt);
    }
    if (coveredFrom == null || Date.parse(first) < Date.parse(coveredFrom))
      starts.push(first);
    since = earliest(starts);
  }
  return {
    since,
    coveredFrom: coveredFrom == null ? since : earliest([since, coveredFrom]),
  };
}
