// The build inlines this file into the page by stripping `export `, so it must stay import-free.

const ms = (iso) => Date.parse(iso);

export function effectivePeriods(periods, now) {
  const sorted = [...periods].sort((a, b) => ms(a.start) - ms(b.start));
  return sorted.map((p, i) => {
    const next = sorted[i + 1];
    return {
      ...p,
      end: next ? next.start : now.toISOString(),
      inProgress: !next,
    };
  });
}

export function assignPeriod(at, eff) {
  const t = ms(at);
  const p = eff.find((x) => ms(x.start) <= t && t < ms(x.end));
  return p ? p.id : null;
}

export function classifyEvent(ev, pr) {
  const t = ms(ev.at);
  if (pr.mergedAt && t > ms(pr.mergedAt)) return "after-merge";
  if (ev.state === "COMMENTED" && !ev.hasBody && ev.inlineComments <= 1)
    return "inline-comment";
  return null;
}

export function memberWindow(m) {
  return {
    from: m.from ? ms(m.from) : -Infinity,
    to: m.to ? ms(m.to) : Infinity,
  };
}

function inWindow(t, w) {
  return w.from <= t && t < w.to;
}

export function countByPeriod(events, members, eff) {
  const byLogin = new Map();
  for (const m of members)
    byLogin.set(m.github, [
      ...(byLogin.get(m.github) ?? []),
      { m, w: memberWindow(m) },
    ]);
  const result = {};
  for (const p of eff) {
    result[p.id] = {};
    for (const m of members) {
      const w = memberWindow(m);
      const overlaps = w.from < ms(p.end) && ms(p.start) < w.to;
      result[p.id][m.id] = overlaps ? { count: 0, reviews: 0, prs: [] } : null;
    }
  }
  const seen = new Map();
  const sorted = [...events].sort((a, b) => ms(a.at) - ms(b.at));
  for (const e of sorted) {
    if (e.excluded) continue;
    const m = byLogin.get(e.login)?.find((x) => inWindow(ms(e.at), x.w))?.m;
    if (!m) continue;
    const pid = assignPeriod(e.at, eff);
    const cell = pid && result[pid][m.id];
    if (!cell) continue;
    const key = `${e.repo}#${e.pr}`;
    const seenKey = `${pid}|${m.id}|${key}`;
    let entry = seen.get(seenKey);
    if (!entry) {
      entry = {
        key,
        url: e.url,
        title: e.prTitle,
        repo: e.repo,
        pr: e.pr,
        firstAt: e.at,
        reviewAts: [],
      };
      seen.set(seenKey, entry);
      cell.prs.push(entry);
      cell.count++;
    }
    entry.reviewAts.push(e.at);
    cell.reviews++;
  }
  return result;
}

export function rankMembers(cells) {
  const sorted = [...cells].sort(
    (a, b) =>
      b.score - a.score || String(a.memberId).localeCompare(String(b.memberId)),
  );
  const ranked = sorted.map((c) => ({
    ...c,
    place: 1 + sorted.filter((o) => o.score > c.score).length,
  }));
  const maxPlace = Math.max(0, ...ranked.map((r) => r.place));
  return ranked.map((r) => ({
    ...r,
    last: maxPlace > 3 && r.place === maxPlace,
  }));
}

function utcDay(t) {
  return new Date(t).toISOString().slice(0, 10);
}

export function dailyCumulative(events, members, period) {
  const counts = countByPeriod(events, members, [period]);
  const start = ms(period.start);
  const end = ms(period.end);
  const days = [];
  for (let d = Date.parse(utcDay(start)); d < end; d += 86_400_000)
    days.push(utcDay(d));
  const out = {};
  for (const m of members) {
    const cell = counts[period.id][m.id];
    if (!cell) continue;
    const perDay = new Map();
    for (const at of cell.prs.flatMap((pr) => pr.reviewAts))
      perDay.set(utcDay(ms(at)), (perDay.get(utcDay(ms(at))) || 0) + 1);
    let total = 0;
    out[m.id] = days.map((day) => ({
      day,
      total: (total += perDay.get(day) || 0),
    }));
  }
  return out;
}

export function periodStatus(period, now, refreshedAt) {
  if (!period.inProgress) return { state: "final", clockEnd: period.end };
  const state =
    period.plannedEnd && now.getTime() >= ms(period.plannedEnd)
      ? "provisional"
      : "live";
  const clockEnd = refreshedAt
    ? new Date(Math.min(ms(period.end), ms(refreshedAt))).toISOString()
    : period.end;
  return { state, clockEnd };
}

export function latestFinishedPeriod(eff, now) {
  return [...eff]
    .reverse()
    .find((p) => periodStatus(p, now, null).state !== "live");
}

export function lastPlaceMark(team) {
  const mark = String(team.lastPlaceEmoji ?? "").trim();
  return mark || null;
}
