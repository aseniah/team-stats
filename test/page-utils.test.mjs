import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hashFor,
  niceScale,
  parseHash,
  resolveSelection,
  topBarHtml,
} from "../lib/page-utils.mjs";

const teams = [
  {
    id: "alpha",
    name: "Alpha",
    periods: [{ id: "sprint-1" }, { id: "sprint-2" }],
  },
  { id: "beta", name: "Beta <b>", periods: [{ id: "b-1" }] },
];
const reports = [
  { id: "one", title: "One", href: "one.html" },
  { id: "two", title: "Two", href: "two.html" },
];

test("parseHash splits team and period", () => {
  assert.deepEqual(parseHash("#alpha/sprint-2"), {
    teamId: "alpha",
    periodId: "sprint-2",
  });
  assert.deepEqual(parseHash("#sprint-2"), {
    teamId: "sprint-2",
    periodId: "sprint-2",
  });
  assert.deepEqual(parseHash(""), { teamId: null, periodId: null });
  assert.deepEqual(parseHash("#a%20b/x%2Fy"), {
    teamId: "a b",
    periodId: "x/y",
  });
  assert.deepEqual(parseHash("#%E0%A4%A"), {
    teamId: "%E0%A4%A",
    periodId: "%E0%A4%A",
  });
});

test("resolveSelection picks the team then a period that exists in it", () => {
  const sel = (h, saved) => {
    const r = resolveSelection(teams, parseHash(h), saved);
    return [r.team?.id, r.periodId];
  };
  assert.deepEqual(sel("#beta/b-1"), ["beta", "b-1"]);
  assert.deepEqual(sel("#beta/sprint-1"), ["beta", null]);
  assert.deepEqual(sel("#beta"), ["beta", null]);
  assert.deepEqual(sel("#sprint-2", "alpha"), ["alpha", "sprint-2"]);
  assert.deepEqual(sel("#sprint-2", "beta"), ["beta", null]);
  assert.deepEqual(sel("#gone/sprint-1", "beta"), ["beta", null]);
  assert.deepEqual(sel("#gone/sprint-1", "also-gone"), ["alpha", "sprint-1"]);
  assert.deepEqual(sel(""), ["alpha", null]);
  assert.deepEqual(resolveSelection([], parseHash(""), null), {
    team: null,
    periodId: null,
  });
});

test("hashFor encodes both parts", () => {
  assert.equal(hashFor("alpha", "sprint 1"), "#alpha/sprint%201");
  assert.equal(hashFor("alpha"), "#alpha");
});

test("topBarHtml shows a team name, not a picker, when one team is configured", () => {
  const html = topBarHtml({
    reports,
    current: "two",
    teams: [teams[0]],
    teamId: "alpha",
    mode: "auto",
  });
  assert.ok(!html.includes("ctl-team"));
  assert.ok(html.includes('<span class="team-name">Alpha</span>'));
  assert.ok(
    html.includes('<a href="two.html#alpha" aria-current="page">Two</a>'),
  );
  assert.ok(html.includes('<a href="one.html#alpha">One</a>'));
  assert.ok(html.includes('id="ctl-mode"'));
});

test("topBarHtml lists every team and escapes names when several are configured", () => {
  const html = topBarHtml({
    reports,
    current: "one",
    teams,
    teamId: "beta",
    mode: "dark",
  });
  assert.ok(html.includes('id="ctl-team"'));
  assert.ok(
    html.includes('<option value="beta" selected>Beta &lt;b&gt;</option>'),
  );
  assert.ok(html.includes('<option value="alpha">Alpha</option>'));
  assert.ok(html.includes('href="two.html#beta"'));
});

test("niceScale grows the axis by 25 in the usual review range", () => {
  assert.deepEqual(niceScale(53), { max: 75, ticks: 3 });
  assert.deepEqual(niceScale(76), { max: 100, ticks: 4 });
  assert.deepEqual(niceScale(101), { max: 125, ticks: 5 });
  assert.deepEqual(niceScale(126), { max: 150, ticks: 3 });
  assert.deepEqual(niceScale(38), { max: 40, ticks: 4 });
  assert.deepEqual(niceScale(7), { max: 8, ticks: 4 });
  assert.deepEqual(niceScale(1), { max: 5, ticks: 5 });
});
