import assert from "node:assert/strict";
import { test } from "node:test";
import { demoTeams } from "../lib/demo-teams.mjs";
import {
  countByPeriod,
  effectivePeriods,
  rankMembers,
} from "../lib/review-stats.mjs";

const DAY = 86_400_000;
const nows = Array.from(
  { length: 28 },
  (_, i) =>
    new Date(Date.parse("2026-11-20T12:00:00Z") + i * DAY + i * 3_600_000),
);

function podiums(team, now) {
  const eff = effectivePeriods(team.periods, now);
  const counts = countByPeriod(team.events, team.members, eff);
  return eff.map((p) => {
    const ranked = rankMembers(
      team.members.map((m) => ({
        memberId: m.id,
        score: counts[p.id][m.id]?.reviews ?? 0,
      })),
    );
    return {
      period: p,
      places: ranked.slice(0, 3).map((r) => r.place),
      lasts: ranked.filter((r) => r.last).length,
    };
  });
}

test("every demo sprint has a clear podium and a single last place, except one older sprint with a two way tie for 2nd", () => {
  for (const now of nows) {
    const tied = [];
    for (const team of demoTeams(now)) {
      const all = podiums(team, now);
      const finished = all.filter((x) => !x.period.inProgress);
      all.forEach(({ period, places, lasts }) => {
        const where = `${team.id} ${period.id} at ${now.toISOString()}`;
        if (places.join() === "1,2,2") tied.push({ team, period, finished });
        else assert.deepEqual(places, [1, 2, 3], `${where} podium`);
        if (team.members.length > 3)
          assert.equal(lasts, 1, `${where} last place`);
      });
    }
    assert.equal(tied.length, 1, `one tied sprint at ${now.toISOString()}`);
    const [{ period, finished }] = tied;
    assert.ok(!period.inProgress);
    assert.notEqual(period.id, finished.at(-1).period.id);
  }
});

test("the demo is the same for the same moment and ends with a sprint in progress", () => {
  const now = nows[0];
  assert.deepEqual(demoTeams(now), demoTeams(now));
  for (const team of demoTeams(now)) {
    const eff = effectivePeriods(team.periods, now);
    assert.equal(eff.length, 6);
    assert.ok(eff.at(-1).inProgress);
    assert.ok(team.events.every((e) => Date.parse(e.at) < now.getTime()));
  }
});

function leadChangesAfterDay3(team, period) {
  const start = Date.parse(period.start);
  const end = Date.parse(period.end);
  const counts = {};
  let leader = null;
  let changes = 0;
  const events = team.events
    .filter((e) => Date.parse(e.at) >= start && Date.parse(e.at) < end)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  for (const e of events) {
    counts[e.login] = (counts[e.login] ?? 0) + 1;
    const [first, second] = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (first[0] === leader || first[1] === second?.[1]) continue;
    if (leader && Date.parse(e.at) - start > 3 * DAY) changes++;
    leader = first[0];
  }
  return changes;
}

test("demo sprints are won by different people and most see the lead change hands after day 3", () => {
  const now = nows[0];
  for (const team of demoTeams(now)) {
    const finished = podiums(team, now).filter((x) => !x.period.inProgress);
    const winners = new Set(
      finished.map(({ period }) => {
        const eff = effectivePeriods(team.periods, now);
        const counts = countByPeriod(team.events, team.members, eff);
        return team.members.reduce((a, b) =>
          (counts[period.id][b.id]?.reviews ?? 0) >
          (counts[period.id][a.id]?.reviews ?? 0)
            ? b
            : a,
        ).id;
      }),
    );
    assert.ok(winners.size >= 3, `${team.id} winners ${[...winners]}`);
    const lively = finished.filter(
      ({ period }) => leadChangesAfterDay3(team, period) > 0,
    );
    assert.ok(
      lively.length * 2 >= finished.length,
      `${team.id} sprints with a late lead change`,
    );
  }
});
