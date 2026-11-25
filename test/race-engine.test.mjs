process.env.TZ = "America/Los_Angeles";

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calendarDays,
  ceremonyGroups,
  clockRate,
  createRace,
  drivenOf,
  placesBy,
  RACE,
  skip,
  start,
  step,
} from "../lib/race-engine.mjs";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const isWeekend = (t) => [0, 6].includes(new Date(t).getDay());
// Wednesday 2026-11-04 09:00 local, two weeks.
const START = new Date(2026, 10, 4, 9).getTime();
const END = START + 14 * DAY;
const at = (day, hour = 0) => START + day * DAY + hour * HOUR;
const racer = (id, times = [], extra = {}) => ({
  id,
  times: [...times].sort((a, b) => a - b),
  joinAt: null,
  leaveAt: null,
  ...extra,
});
const burst = (t, n, spanMs = 30 * 60_000) =>
  Array.from({ length: n }, (_, i) => t + (i * spanMs) / n);

function run(
  race,
  {
    until = () => race.phase === "ceremony",
    frame = 16,
    max = 200_000,
    each,
  } = {},
) {
  const events = [];
  let now = 0;
  start(race);
  for (let i = 0; i < max && !until(); i++) {
    now += frame;
    const evs = step(race, frame, now);
    for (const e of evs) events.push({ ...e, now });
    each?.(race);
  }
  return events;
}

test("placesBy ranks ties 1, 2, 2, 4", () => {
  const items = [{ s: 9 }, { s: 5 }, { s: 5 }, { s: 1 }];
  const p = placesBy(items, (x) => x.s);
  assert.deepEqual(
    items.map((x) => p.get(x)),
    [1, 2, 2, 4],
  );
});

test("calendarDays labels days correctly across the Nov 1 daylight saving change", () => {
  const s = new Date(2026, 9, 30, 0).getTime();
  const e = new Date(2026, 10, 3, 0).getTime();
  const days = calendarDays(s, e);
  assert.equal(days.length, 4);
  for (const [d, next] of days) {
    const x = new Date(d);
    assert.equal(x.getHours(), 0);
    assert.equal(x.getMinutes(), 0);
    assert.equal(new Date(next).getHours(), 0);
  }
  assert.equal(days[2][1] - days[2][0], 25 * HOUR);
});

test("clockRate plays weekends at 2x and totals about 60 seconds", () => {
  const rate = clockRate(START, END, isWeekend);
  assert.ok(rate > 0);
  const race = createRace({
    racers: [racer("a")],
    start: START,
    end: END,
    isWeekend,
  });
  start(race);
  let real = 0;
  let weekdayStep = null;
  let weekendStep = null;
  while (race.phase === "race") {
    const before = race.simT;
    const wk = isWeekend(before);
    step(race, 16, (real += 16));
    const d = race.simT - before;
    if (race.phase !== "race") break;
    if (wk && weekendStep === null) weekendStep = d;
    if (!wk && weekdayStep === null) weekdayStep = d;
  }
  assert.ok(Math.abs(real - RACE.raceMs) <= 1000, `race took ${real} ms`);
  assert.ok(Math.abs(weekendStep / weekdayStep - RACE.weekendSpeed) < 0.01);
});

test("a race cut short of its planned end keeps the full sprint per day speed", () => {
  const cut = at(5);
  const full = createRace({
    racers: [racer("a")],
    start: START,
    end: END,
    isWeekend,
  });
  const live = createRace({
    racers: [racer("a")],
    start: START,
    end: cut,
    scaleEnd: END,
    isWeekend,
  });
  assert.equal(live.rate, full.rate);
  start(live);
  let real = 0;
  while (live.phase === "race") step(live, 16, (real += 16));
  const expected = (clockRate(START, cut, isWeekend) * RACE.raceMs) / full.rate;
  assert.ok(
    Math.abs(real - expected) <= 100,
    `race took ${real} ms, expected about ${Math.round(expected)}`,
  );
  assert.ok(real < RACE.raceMs / 2);
});

test("a planned end earlier than the actual end never speeds the race past 60 seconds", () => {
  const race = createRace({
    racers: [racer("a")],
    start: START,
    end: END,
    scaleEnd: at(10),
    isWeekend,
  });
  assert.equal(race.rate, clockRate(START, END, isWeekend));
});

test("step never drives a car past its arrived total and drains a 20 review burst within one race day", () => {
  const t = at(0, 2);
  const race = createRace({
    racers: [racer("a", burst(t, 20))],
    start: START,
    end: END,
    isWeekend,
  });
  const r = race.racers[0];
  let drained = null;
  run(race, {
    until: () => race.phase !== "race",
    each: () => {
      assert.ok(
        r.shownDist <= r.target + 1e-9,
        `shown ${r.shownDist} target ${r.target}`,
      );
      if (drained === null && r.target === 20 && r.target - r.shownDist < 0.02)
        drained = race.simT;
    },
  });
  assert.ok(
    drained !== null && drained - t <= DAY,
    `drained after ${(drained - t) / HOUR} h`,
  );
});

test("step clamps a large frame gap", () => {
  const a = createRace({
    racers: [racer("a")],
    start: START,
    end: END,
    isWeekend,
  });
  const b = createRace({
    racers: [racer("a")],
    start: START,
    end: END,
    isWeekend,
  });
  start(a);
  start(b);
  step(a, 10_000, 10_000);
  step(b, RACE.frameClampMs, RACE.frameClampMs);
  assert.equal(a.simT, b.simT);
});

test("boost fires once for 4 reviews in an hour and not again within 2 race hours", () => {
  const t1 = at(0, 2);
  // The flame holds for boostMinMs of real time (about 13 race hours here), so this lands just after it ends.
  const t2 = t1 + 14.5 * HOUR;
  const t3 = at(2, 2);
  const race = createRace({
    racers: [
      racer("a", [...burst(t1, 4), ...burst(t2, 4), ...burst(t3, 4)]),
      racer("b"),
    ],
    start: START,
    end: END,
    isWeekend,
  });
  const boosts = run(race, { until: () => race.phase !== "race" }).filter(
    (e) => e.type === "boost",
  );
  assert.equal(boosts.length, 2);
  assert.ok(boosts[0].t >= t1 && boosts[0].t < t1 + HOUR);
  assert.ok(boosts[1].t >= t3 && boosts[1].t < t3 + HOUR);
});

test("pass events use whole counts; a tie is not a pass; a re-pass sets back", () => {
  const race = createRace({
    racers: [
      racer("c", burst(at(0, 1), 20)),
      racer("a", [...burst(at(1, 2), 4), ...burst(at(9, 3), 3)]),
      racer("b", [...burst(at(3, 2), 4), ...burst(at(5, 2), 2)]),
      racer("d"),
    ],
    start: START,
    end: END,
    isWeekend,
  });
  const events = run(race, { until: () => race.phase !== "race" });
  const pairs = events.filter(
    (e) =>
      (e.type === "pass" || e.type === "lead") &&
      [e.a, e.b].sort().join() === "a,b",
  );
  assert.deepEqual(
    pairs.map((e) => [e.type, e.a, e.b, e.place, e.back]),
    [
      ["pass", "b", "a", 2, false],
      ["pass", "a", "b", 2, true],
    ],
  );
  assert.ok(pairs[0].t >= at(5, 2), "no pass while b only ties a at 4");
});

test("a podium tie is announced only after holding 3 race hours, once per pair per day", () => {
  const race = createRace({
    racers: [
      racer("a", [...burst(at(1, 1), 5), at(1, 9)]),
      racer("b", [...burst(at(1, 2), 5), at(1, 11)]),
      racer("z"),
    ],
    start: START,
    end: END,
    isWeekend,
  });
  const ties = run(race, { until: () => race.phase !== "race" }).filter(
    (e) => e.type === "tie",
  );
  assert.equal(ties.length, 1);
  assert.ok(ties[0].t >= at(1, 2) + RACE.tieHoldMs);
  assert.equal(ties[0].place, 1);
});

test("join and leave events fire at the member's from and to", () => {
  const joinAt = at(4, 3);
  const leaveAt = at(9, 5);
  const race = createRace({
    racers: [racer("a", [at(5)], { joinAt, leaveAt }), racer("b")],
    start: START,
    end: END,
    isWeekend,
  });
  assert.equal(race.racers[0].joined, false);
  const evs = run(race, { until: () => race.phase !== "race" });
  const join = evs.find((e) => e.type === "join");
  const leave = evs.find((e) => e.type === "leave");
  assert.equal(join.a, "a");
  assert.ok(join.t >= joinAt && join.t < joinAt + HOUR);
  assert.equal(leave.a, "a");
  assert.ok(leave.t >= leaveAt && leave.t < leaveAt + HOUR);
  assert.equal(race.racers[0].left, true);
});

test("ceremonyGroups orders finishers, shares ties, and flags last below 3rd", () => {
  const n = (k) => Array.from({ length: k }, (_, i) => at(1) + i * 60_000);
  const race = createRace({
    racers: [
      racer("ada", n(25)),
      racer("ben", n(32)),
      racer("cleo", n(28)),
      racer("dev", n(28)),
      racer("fay"),
    ],
    start: START,
    end: END,
    isWeekend,
  });
  assert.deepEqual(ceremonyGroups(race), [
    { place: 1, last: false, zero: false, ids: ["ben"] },
    { place: 2, last: false, zero: false, ids: ["cleo", "dev"] },
    { place: 4, last: false, zero: false, ids: ["ada"] },
    { place: 5, last: true, zero: true, ids: ["fay"] },
  ]);
});

test("a race where everyone has zero reviews reaches the ceremony without NaN", () => {
  const race = createRace({
    racers: [racer("a"), racer("b")],
    start: START,
    end: END,
    isWeekend,
  });
  assert.equal(race.finishDist, 1);
  const evs = run(race);
  assert.equal(race.phase, "ceremony");
  assert.ok(evs.some((e) => e.type === "ceremony"));
  for (const r of race.racers) {
    assert.ok(Number.isFinite(r.shownDist) && Number.isFinite(r.drawDist));
    assert.equal(drivenOf(r), 0);
  }
  assert.deepEqual(ceremonyGroups(race), [
    { place: 1, last: false, zero: true, ids: ["a", "b"] },
  ]);
});

test("skip jumps everyone to their totals", () => {
  const race = createRace({
    racers: [racer("a", burst(at(2), 7)), racer("b", [at(10)])],
    start: START,
    end: END,
    isWeekend,
  });
  start(race);
  step(race, 16, 16);
  skip(race);
  assert.equal(race.phase, "runout");
  assert.equal(race.simT, END);
  assert.deepEqual(race.racers.map(drivenOf), [7, 1]);
  const evs = step(race, 16, 32);
  assert.equal(race.phase, "ceremony");
  assert.ok(evs.some((e) => e.type === "ceremony"));
});

test("weekend events fire for the first review per racer per weekend day", () => {
  const sat = new Date(2026, 10, 7, 10).getTime();
  const race = createRace({
    racers: [
      racer("a", [sat, sat + HOUR, sat + DAY, at(5, 1)]),
      racer("b", [sat + 2 * HOUR]),
    ],
    start: START,
    end: END,
    isWeekend,
  });
  const wk = run(race, { until: () => race.phase !== "race" }).filter(
    (e) => e.type === "weekend",
  );
  assert.deepEqual(
    wk.map((e) => [e.a, e.day]),
    [
      ["a", sat],
      ["b", sat + 2 * HOUR],
      ["a", sat + DAY],
    ],
  );
});

test("the runout of a short live race finishes within a few seconds", () => {
  const end = START + 2 * HOUR;
  const race = createRace({
    racers: [racer("a", burst(end - 10 * 60_000, 3)), racer("b")],
    start: START,
    end,
    isWeekend,
  });
  let runoutStart = null;
  let real = 0;
  start(race);
  while (race.phase !== "ceremony" && real < 600_000) {
    real += 16;
    step(race, 16, real);
    if (race.phase === "runout" && runoutStart === null) runoutStart = real;
  }
  assert.equal(race.phase, "ceremony");
  assert.ok(real - runoutStart <= 5000, `runout took ${real - runoutStart} ms`);
});
