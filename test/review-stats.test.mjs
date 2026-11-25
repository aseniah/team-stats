import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assignPeriod,
  classifyEvent,
  countByPeriod,
  dailyCumulative,
  effectivePeriods,
  lastPlaceMark,
  latestFinishedPeriod,
  periodStatus,
  rankMembers,
} from "../lib/review-stats.mjs";

const periods = [
  {
    id: "sprint-40",
    kind: "sprint",
    name: "Sprint 40 Aspen",
    start: "2026-09-23T17:00:00.000Z",
    plannedEnd: "2026-10-07T17:00:00.000Z",
  },
  {
    id: "sprint-41",
    kind: "sprint",
    name: "Sprint 41 Birch",
    start: "2026-10-07T17:00:00.000Z",
    plannedEnd: "2026-10-21T17:00:00.000Z",
  },
  {
    id: "sprint-42",
    kind: "sprint",
    name: "Sprint 42 Cedar",
    start: "2026-10-21T17:00:00.000Z",
    plannedEnd: "2026-11-04T17:00:00.000Z",
  },
  {
    id: "sprint-43",
    kind: "sprint",
    name: "Sprint 43 Dogwood",
    start: "2026-11-04T17:00:00.000Z",
    plannedEnd: "2026-11-18T17:00:00.000Z",
  },
];
const now = new Date("2026-11-18T12:00:00Z");
const eff = effectivePeriods(periods, now);

const member = (id, extra = {}) => ({
  id,
  name: id,
  github: id,
  from: "2026-01-01",
  to: null,
  ...extra,
});
const ev = (login, at, pr = 1, extra = {}) => ({
  id: `${login}-${at}-${pr}`,
  at,
  login,
  kind: "review",
  state: "APPROVED",
  repo: "acme/widgets",
  pr,
  prAuthor: "someone",
  prTitle: `PR ${pr}`,
  url: `https://github.com/acme/widgets/pull/${pr}`,
  ...extra,
});

test("effectivePeriods ends each period at the next start", () => {
  const s42 = eff.find((p) => p.id === "sprint-42");
  assert.equal(s42.end, "2026-11-04T17:00:00.000Z");
  assert.equal(s42.inProgress, false);
  const s43 = eff.find((p) => p.id === "sprint-43");
  assert.equal(s43.inProgress, true);
  assert.equal(s43.end, now.toISOString());
});

test("effectivePeriods sorts by start", () => {
  const shuffled = [periods[2], periods[0], periods[3], periods[1]];
  assert.deepEqual(
    effectivePeriods(shuffled, now).map((p) => p.id),
    eff.map((p) => p.id),
  );
});

test("assignPeriod puts boundary events in the later period", () => {
  assert.equal(assignPeriod("2026-11-04T17:00:00.000Z", eff), "sprint-43");
  assert.equal(assignPeriod("2026-11-04T16:59:59.999Z", eff), "sprint-42");
  assert.equal(assignPeriod("2026-09-01T00:00:00Z", eff), null);
  assert.equal(assignPeriod("2026-11-19T00:00:00Z", eff), null);
});

test("classifyEvent", () => {
  const merged = {
    mergedAt: "2026-11-10T12:00:00Z",
    closedAt: "2026-11-10T12:00:00Z",
  };
  assert.equal(
    classifyEvent({ state: "APPROVED", at: "2026-11-10T12:00:01Z" }, merged),
    "after-merge",
  );
  assert.equal(
    classifyEvent({ state: "APPROVED", at: "2026-11-10T11:59:59Z" }, merged),
    null,
  );
  const closed = { mergedAt: null, closedAt: "2026-11-10T12:00:00Z" };
  assert.equal(
    classifyEvent({ state: "APPROVED", at: "2026-11-15T12:00:00Z" }, closed),
    null,
  );
  assert.equal(
    classifyEvent(
      {
        state: "COMMENTED",
        at: "2026-11-09T00:00:00Z",
        hasBody: false,
        inlineComments: 1,
      },
      closed,
    ),
    "inline-comment",
  );
  assert.equal(
    classifyEvent(
      {
        state: "COMMENTED",
        at: "2026-11-09T00:00:00Z",
        hasBody: false,
        inlineComments: 2,
      },
      closed,
    ),
    null,
  );
  assert.equal(
    classifyEvent(
      {
        state: "COMMENTED",
        at: "2026-11-09T00:00:00Z",
        hasBody: true,
        inlineComments: 1,
      },
      closed,
    ),
    null,
  );
  assert.equal(
    classifyEvent(
      {
        state: "COMMENTED",
        at: "2026-11-10T12:00:01Z",
        hasBody: false,
        inlineComments: 1,
      },
      merged,
    ),
    "after-merge",
  );
});

test("countByPeriod counts distinct PRs per period", () => {
  const members = [member("ada")];
  const events = [
    ev("ada", "2026-11-05T10:00:00Z", 1),
    ev("ada", "2026-11-06T10:00:00Z", 1, { id: "second" }),
    ev("ada", "2026-10-25T10:00:00Z", 1),
    ev("ada", "2026-11-07T10:00:00Z", 2, { excluded: "after-merge" }),
  ];
  const c = countByPeriod(events, members, eff);
  assert.equal(c["sprint-43"].ada.count, 1);
  assert.equal(c["sprint-43"].ada.prs[0].firstAt, "2026-11-05T10:00:00Z");
  assert.equal(c["sprint-42"].ada.count, 1);
  assert.equal(c["sprint-41"].ada.count, 0);
});

test("countByPeriod counts every review and distinct PRs per cell", () => {
  const members = [member("ada")];
  const events = [
    ev("ada", "2026-11-05T10:00:00Z", 1, { id: "a" }),
    ev("ada", "2026-11-05T11:00:00Z", 1, { id: "b" }),
    ev("ada", "2026-11-07T10:00:00Z", 2, { id: "c" }),
    ev("ada", "2026-11-08T10:00:00Z", 2, { id: "d", excluded: "after-merge" }),
    ev("ada", "2026-11-04T16:00:00Z", 2, { id: "e" }),
  ];
  const c = countByPeriod(events, members, eff);
  assert.equal(c["sprint-43"].ada.reviews, 3);
  assert.equal(c["sprint-43"].ada.count, 2);
  assert.deepEqual(
    c["sprint-43"].ada.prs.map((p) => p.reviewAts.length),
    [2, 1],
  );
  assert.equal(c["sprint-42"].ada.reviews, 1);
});

test("countByPeriod respects membership windows", () => {
  const members = [
    member("will", { to: "2026-10-21T17:00:00.000Z" }),
    member("new", { from: "2026-11-10" }),
  ];
  const events = [
    ev("will", "2026-10-10T00:00:00Z"),
    ev("will", "2026-11-06T00:00:00Z", 2),
  ];
  const c = countByPeriod(events, members, eff);
  assert.equal(c["sprint-41"].will.count, 1);
  assert.equal(c["sprint-43"].will, null);
  assert.equal(c["sprint-43"].new.count, 0);
  assert.equal(c["sprint-42"].new, null);
});

test("countByPeriod drops events outside the member window inside an active period", () => {
  const members = [member("new", { from: "2026-11-10" })];
  const c = countByPeriod([ev("new", "2026-11-05T00:00:00Z")], members, eff);
  assert.equal(c["sprint-43"].new.count, 0);
});

test("rankMembers uses competition ranking and flags last place", () => {
  const r = rankMembers([
    { memberId: "c", score: 3 },
    { memberId: "a", score: 5 },
    { memberId: "b", score: 5 },
    { memberId: "d", score: 0 },
  ]);
  assert.deepEqual(
    r.map((x) => [x.memberId, x.place, x.last]),
    [
      ["a", 1, false],
      ["b", 1, false],
      ["c", 3, false],
      ["d", 4, true],
    ],
  );
});

test("rankMembers gives no last place when it would be on the podium", () => {
  const r = rankMembers([
    { memberId: "a", score: 2 },
    { memberId: "b", score: 1 },
    { memberId: "c", score: 1 },
  ]);
  assert.equal(
    r.some((x) => x.last),
    false,
  );
  const tied = rankMembers(
    [1, 1, 1, 1].map((score, i) => ({ memberId: String(i), score })),
  );
  assert.equal(
    tied.some((x) => x.last),
    false,
  );
});

test("dailyCumulative counts reviews by UTC day", () => {
  const members = [member("ada")];
  const p = eff.find((x) => x.id === "sprint-43");
  const events = [
    ev("ada", "2026-11-05T10:00:00Z", 1),
    ev("ada", "2026-11-06T10:00:00Z", 1, { id: "second" }),
    ev("ada", "2026-11-06T11:00:00Z", 2),
  ];
  const d = dailyCumulative(events, members, p).ada;
  assert.deepEqual(d.slice(0, 3), [
    { day: "2026-11-04", total: 0 },
    { day: "2026-11-05", total: 1 },
    { day: "2026-11-06", total: 3 },
  ]);
  assert.equal(d.at(-1).day, "2026-11-18");
  assert.equal(d.at(-1).total, 3);
});

const statusPeriods = effectivePeriods(
  [
    {
      id: "a",
      start: "2026-11-01T00:00:00Z",
      plannedEnd: "2026-11-15T00:00:00Z",
    },
    {
      id: "b",
      start: "2026-11-15T00:00:00Z",
      plannedEnd: "2026-11-29T00:00:00Z",
    },
  ],
  new Date("2026-11-30T00:00:00Z"),
);

test("periodStatus marks closed, past-planned-end, and live sprints", () => {
  const [a, b] = statusPeriods;
  assert.deepEqual(
    periodStatus(a, new Date("2026-11-30T00:00:00Z"), "2026-11-29T12:00:00Z"),
    { state: "final", clockEnd: "2026-11-15T00:00:00Z" },
  );
  assert.deepEqual(
    periodStatus(b, new Date("2026-11-30T00:00:00Z"), "2026-11-29T12:00:00Z"),
    { state: "provisional", clockEnd: "2026-11-29T12:00:00.000Z" },
  );
  const live = { ...b, end: "2026-11-20T00:00:00.000Z" };
  assert.deepEqual(
    periodStatus(
      live,
      new Date("2026-11-20T00:00:00Z"),
      "2026-11-19T08:00:00Z",
    ),
    { state: "live", clockEnd: "2026-11-19T08:00:00.000Z" },
  );
});

test("periodStatus with no refresh ends the clock at period end", () => {
  const b = statusPeriods[1];
  assert.deepEqual(periodStatus(b, new Date("2026-11-20T00:00:00Z"), null), {
    state: "live",
    clockEnd: b.end,
  });
});

test("latestFinishedPeriod skips a live sprint", () => {
  const eff = effectivePeriods(statusPeriods, new Date("2026-11-20T00:00:00Z"));
  assert.equal(
    latestFinishedPeriod(eff, new Date("2026-11-20T00:00:00Z")).id,
    "a",
  );
  assert.equal(
    latestFinishedPeriod(eff, new Date("2026-11-30T00:00:00Z")).id,
    "b",
  );
  assert.equal(latestFinishedPeriod([], new Date()), undefined);
});

test("lastPlaceMark is off unless the team sets an emoji", () => {
  assert.equal(lastPlaceMark({}), null);
  assert.equal(lastPlaceMark({ lastPlaceEmoji: "💩" }), "💩");
  assert.equal(lastPlaceMark({ lastPlaceEmoji: "🐢" }), "🐢");
  assert.equal(lastPlaceMark({ lastPlaceEmoji: "" }), null);
  assert.equal(lastPlaceMark({ lastPlaceEmoji: null }), null);
  assert.equal(lastPlaceMark({ lastPlaceEmoji: "  " }), null);
});

test("countByPeriod credits each stint when a member leaves and rejoins under a new entry", () => {
  const members = [
    member("ada", { github: "ada-gh", to: "2026-10-07T17:00:00.000Z" }),
    member("ada-again", { github: "ada-gh", from: "2026-10-21T17:00:00.000Z" }),
  ];
  const events = [
    ev("ada-gh", "2026-09-25T00:00:00Z"),
    ev("ada-gh", "2026-10-10T00:00:00Z", 2),
    ev("ada-gh", "2026-11-06T00:00:00Z", 3),
  ];
  const c = countByPeriod(events, members, eff);
  assert.equal(c["sprint-40"].ada.reviews, 1);
  assert.equal(c["sprint-41"].ada, null);
  assert.equal(c["sprint-41"]["ada-again"], null);
  assert.equal(c["sprint-43"]["ada-again"].reviews, 1);
});
