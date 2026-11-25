// The build inlines this file into the race page by stripping `export `, so it must stay import-free.

const HOUR = 3_600_000;

export const RACE = {
  raceMs: 60_000,
  weekendSpeed: 2,
  surgeShare: 0.7,
  speedFadeMs: 8 * HOUR,
  queueDrainMs: 6 * HOUR,
  cruisePerMs: 1 / (3 * HOUR),
  boostN: 4,
  boostWindowMs: HOUR,
  boostPaceFadeMs: 1.5 * HOUR,
  boostOffPerHour: 1.5,
  boostRearmMs: 2 * HOUR,
  boostMinMs: 2800,
  tieHoldMs: 3 * HOUR,
  tieRepeatMs: 24 * HOUR,
  passCooldownMs: 4000,
  frameClampMs: 64,
  drawSmoothMs: 250,
  crossSmoothMs: 220,
  runoutMinRate: (2 * 6 * HOUR) / 3000,
};

export function placesBy(items, score) {
  return new Map(
    items.map((x) => [x, 1 + items.filter((o) => score(o) > score(x)).length]),
  );
}

export function calendarDays(startMs, endMs) {
  const days = [];
  const d = new Date(startMs);
  d.setHours(0, 0, 0, 0);
  while (d.getTime() < endMs) {
    const t = d.getTime();
    d.setDate(d.getDate() + 1);
    days.push([t, d.getTime()]);
  }
  return days;
}

export function clockRate(startMs, endMs, isWeekend) {
  let weekendMs = 0;
  for (const [a, b] of calendarDays(startMs, endMs)) {
    if (isWeekend(a)) weekendMs += Math.min(b, endMs) - Math.max(a, startMs);
  }
  const span = endMs - startMs;
  return (
    Math.max(1, span - weekendMs + weekendMs / RACE.weekendSpeed) / RACE.raceMs
  );
}

export function createRace({
  racers,
  start: startMs,
  end,
  scaleEnd,
  isWeekend,
}) {
  const rs = racers.map((r) => ({
    id: r.id,
    times: [...r.times].sort((a, b) => a - b),
    joinAt: r.joinAt ?? null,
    leaveAt: r.leaveAt ?? null,
    final: r.times.length,
    target: 0,
    shownDist: 0,
    drawDist: 0,
    v: 0,
    pace: 0,
    boost: false,
    boostAt: null,
    boostOffAt: null,
    joined: r.joinAt == null || r.joinAt <= startMs,
    left: r.leaveAt != null && r.leaveAt <= startMs,
    crossTarget: null,
  }));
  return {
    phase: "grid",
    start: startMs,
    end,
    simT: startMs,
    isWeekend,
    rate: clockRate(startMs, Math.max(end, scaleEnd ?? end), isWeekend),
    finishDist: Math.max(1, ...rs.map((r) => r.final)),
    racers: rs,
    order: [...rs],
    pairLeader: new Map(),
    pairAt: new Map(),
    passedBy: new Set(),
    tieSince: new Map(),
    tieAnnouncedAt: new Map(),
    tied: new Set(),
    weekendSeen: new Set(),
  };
}

export function start(race) {
  race.phase = "race";
  return [{ type: "start", t: race.simT }];
}

export function drivenOf(r) {
  return Math.max(0, Math.ceil(Math.min(r.final, r.shownDist) - 0.05));
}

const recentCount = (r, T) =>
  r.times.filter((t) => t <= T && T - t < RACE.boostWindowMs).length;

function arrive(race, events) {
  for (const r of race.racers) {
    if (!r.joined && r.joinAt !== null && race.simT >= r.joinAt) {
      r.joined = true;
      events.push({ type: "join", a: r.id, t: race.simT });
    }
    if (!r.left && r.leaveAt !== null && race.simT >= r.leaveAt) {
      r.left = true;
      events.push({ type: "leave", a: r.id, t: race.simT });
    }
    while (r.target < r.times.length && r.times[r.target] <= race.simT) {
      const t = r.times[r.target++];
      r.v += RACE.surgeShare / RACE.speedFadeMs;
      r.pace += 1 / RACE.boostPaceFadeMs;
      if (race.isWeekend(t)) {
        const key = `${r.id}|${new Date(t).toDateString()}`;
        if (!race.weekendSeen.has(key)) {
          race.weekendSeen.add(key);
          events.push({ type: "weekend", a: r.id, day: t, t });
        }
      }
    }
  }
}

function drive(race, dt, simDt, nowMs, events) {
  const fade = Math.exp(-simDt / RACE.speedFadeMs);
  const paceFade = Math.exp(-simDt / RACE.boostPaceFadeMs);
  const smooth = 1 - Math.exp(-dt / RACE.drawSmoothMs);
  for (const r of race.racers) {
    if (r.crossTarget !== null) {
      r.shownDist +=
        (r.crossTarget - r.shownDist) *
        (1 - Math.exp(-dt / RACE.crossSmoothMs));
      r.drawDist = r.shownDist;
      r.boost = r.crossTarget - r.shownDist > 0.5;
      continue;
    }
    const queue = r.target - r.shownDist;
    if (queue > 0)
      r.shownDist = Math.min(
        r.target,
        r.shownDist +
          Math.max(r.v, queue / RACE.queueDrainMs, RACE.cruisePerMs) * simDt,
      );
    r.drawDist += (r.shownDist - r.drawDist) * smooth;
    r.v *= fade;
    r.pace *= paceFade;
    const rested = race.simT - (r.boostOffAt ?? -Infinity) >= RACE.boostRearmMs;
    const holding =
      r.boost &&
      (nowMs - r.boostAt < RACE.boostMinMs ||
        r.pace * HOUR >= RACE.boostOffPerHour);
    const boosting =
      race.phase === "race" &&
      (r.boost ? holding : rested && recentCount(r, race.simT) >= RACE.boostN);
    if (r.boost && !boosting) r.boostOffAt = race.simT;
    if (boosting && !r.boost) {
      r.boostAt = nowMs;
      events.push({ type: "boost", a: r.id, t: race.simT });
    }
    r.boost = boosting;
  }
}

function detectPasses(race, nowMs, events) {
  const next = [...race.order].sort((a, b) => drivenOf(b) - drivenOf(a));
  race.order = next;
  if (!next.length) return;
  const pairKey = (a, b) => [a.id, b.id].sort().join("|");
  if (next[0].shownDist < 3) {
    next.forEach((a, i) =>
      next.slice(i + 1).forEach((b) => race.pairLeader.set(pairKey(a, b), a)),
    );
    return;
  }
  const places = placesBy(race.racers, drivenOf);
  for (let i = 0; i + 1 < next.length; i++) {
    const ahead = next[i];
    const behind = next[i + 1];
    const key = pairKey(ahead, behind);
    const cooling =
      nowMs - (race.pairAt.get(key) ?? -Infinity) < RACE.passCooldownMs;
    if (drivenOf(ahead) === drivenOf(behind)) {
      if (!race.tieSince.has(key)) race.tieSince.set(key, race.simT);
      const held = race.simT - race.tieSince.get(key) >= RACE.tieHoldMs;
      const fresh =
        race.simT - (race.tieAnnouncedAt.get(key) ?? -Infinity) >=
        RACE.tieRepeatMs;
      if (
        drivenOf(ahead) > 0 &&
        held &&
        fresh &&
        places.get(ahead) <= 3 &&
        !race.tied.has(key) &&
        !cooling
      ) {
        race.tied.add(key);
        race.tieAnnouncedAt.set(key, race.simT);
        race.pairAt.set(key, nowMs);
        events.push({
          type: "tie",
          a: ahead.id,
          b: behind.id,
          place: places.get(ahead),
          t: race.simT,
        });
      }
      continue;
    }
    race.tied.delete(key);
    race.tieSince.delete(key);
    if (race.pairLeader.get(key) === ahead || cooling) continue;
    race.pairLeader.set(key, ahead);
    race.pairAt.set(key, nowMs);
    const back = race.passedBy.has(`${ahead.id}<${behind.id}`);
    race.passedBy.add(`${behind.id}<${ahead.id}`);
    events.push({
      type: i === 0 ? "lead" : "pass",
      a: ahead.id,
      b: behind.id,
      place: places.get(ahead),
      back,
      t: race.simT,
    });
  }
}

export function step(race, realDtMs, nowMs) {
  const events = [];
  if (race.phase === "grid" || race.phase === "done") return events;
  const dt = Math.min(RACE.frameClampMs, Math.max(0, realDtMs));
  let simDt = 0;
  if (race.phase === "race") {
    const before = race.simT;
    race.simT = Math.min(
      race.end,
      race.simT +
        dt * race.rate * (race.isWeekend(race.simT) ? RACE.weekendSpeed : 1),
    );
    simDt = race.simT - before;
    arrive(race, events);
    if (race.simT >= race.end) {
      race.phase = "runout";
      events.push({
        type: "timeUp",
        t: race.simT,
        queued: race.racers.some((r) => r.target - r.shownDist > 0.5),
      });
    }
  } else if (race.phase === "runout") {
    simDt = dt * Math.max(race.rate, RACE.runoutMinRate);
  }
  drive(race, dt, simDt, nowMs, events);
  if (race.phase === "race" || race.phase === "runout")
    detectPasses(race, nowMs, events);
  if (
    race.phase === "runout" &&
    race.racers.every((r) => r.target - r.shownDist < 0.02)
  ) {
    race.phase = "ceremony";
    events.push({ type: "ceremony", t: race.simT });
  }
  return events;
}

export function skip(race) {
  if (race.phase !== "race" && race.phase !== "runout") return;
  race.simT = race.end;
  race.phase = "runout";
  for (const r of race.racers) {
    r.target = r.final;
    r.shownDist = r.final;
    r.drawDist = r.final;
    r.v = 0;
    r.pace = 0;
    r.boost = false;
    r.joined = r.joinAt === null || r.joinAt <= race.end;
    r.left = r.leaveAt !== null && r.leaveAt <= race.end;
  }
  race.order = [...race.racers].sort((a, b) => b.final - a.final);
  race.racers.forEach((a, i) =>
    race.racers.slice(i + 1).forEach((b) => {
      race.pairLeader.set(
        [a.id, b.id].sort().join("|"),
        a.final >= b.final ? a : b,
      );
    }),
  );
}

export function ceremonyGroups(race) {
  const places = placesBy(race.racers, (r) => r.final);
  const distinct = [...new Set(race.racers.map((r) => places.get(r)))].sort(
    (a, b) => a - b,
  );
  const lastPlace = Math.max(0, ...distinct);
  return distinct.map((place) => ({
    place,
    last: lastPlace > 3 && place === lastPlace,
    zero: race.racers.some((r) => places.get(r) === place && r.final === 0),
    ids: race.racers.filter((r) => places.get(r) === place).map((r) => r.id),
  }));
}
