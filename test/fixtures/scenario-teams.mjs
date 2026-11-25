const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const PT = 8 * HOUR;

function rng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Invented teams that exercise every leaderboard and race edge case: ties, a late joiner, a zero, a live sprint.
export function scenarioTeams(now = new Date()) {
  return [raceTeam(now), secondTeam(now)];
}

function secondTeam(now) {
  const rand = rng(7);
  const members = [
    ["hal", "Hal Ives"],
    ["ivy", "Ivy Cho"],
    ["jo", "Jo Banks"],
  ].map(([id, name]) => ({
    id,
    name,
    github: `demo-${id}`,
    from: "2026-01-01",
    to: null,
  }));
  const periods = [
    {
      id: "blue-1",
      kind: "sprint",
      name: "Blue 1 Harbor",
      label: "B1",
      start: "2026-10-20T16:00:00Z",
      plannedEnd: "2026-11-03T16:00:00Z",
    },
    {
      id: "blue-2",
      kind: "sprint",
      name: "Blue 2 Lantern",
      label: "B2",
      start: "2026-11-03T16:00:00Z",
      plannedEnd: "2026-11-17T16:00:00Z",
    },
    {
      id: "blue-3",
      kind: "sprint",
      name: "Blue 3 Meadow",
      label: "B3",
      start: "2026-11-17T16:00:00Z",
      plannedEnd: "2026-12-01T16:00:00Z",
    },
  ];
  const events = [];
  const day0 = Date.parse("2026-10-20T16:00:00Z");
  let pr = 5000;
  for (let i = 0; i < 42; i++) {
    for (const [k, m] of members.entries()) {
      const n = Math.floor(rand() * (4 - k));
      for (let j = 0; j < n; j++) {
        pr++;
        events.push({
          id: `demo2-${pr}`,
          at: new Date(day0 + i * DAY + (1 + rand() * 8) * HOUR).toISOString(),
          login: m.github,
          repo: "demo/service",
          pr,
          prTitle: `Service PR ${pr}`,
          url: `https://example.invalid/pr/${pr}`,
        });
      }
    }
  }
  return {
    id: "demo-two",
    name: "Second demo",
    githubOrg: "demo",
    members,
    periods,
    events: events.filter((e) => Date.parse(e.at) < now.getTime()),
    refreshedAt: now.toISOString(),
  };
}

function raceTeam(now) {
  const rand = rng(122);
  const members = [
    ["ada", "Ada Park", "Ada"],
    ["ben", "Ben Ortiz", "Ben"],
    ["cleo", "Cleo Nash", "Cleo"],
    ["dev", "Dev Rao", "Dev"],
    ["eli", "Eli Moss", "Eli"],
    ["fay", "Fay Lund", "Fay"],
    ["gus", "Gus Hale", "Gus"],
  ].map(([id, name, displayName]) => ({
    id,
    name,
    displayName,
    github: `demo-${id}`,
    from: id === "gus" ? "2026-11-04T08:00:00Z" : "2026-01-01",
    to: null,
  }));
  const periods = [
    {
      id: "demo-1",
      kind: "sprint",
      name: "Sprint 901 Edge Cases",
      label: "901",
      start: "2026-10-29T08:00:00Z",
      plannedEnd: "2026-11-12T08:00:00Z",
    },
    {
      id: "demo-2",
      kind: "sprint",
      name: "Sprint 902 Midway",
      label: "902",
      start: "2026-11-12T08:00:00Z",
      plannedEnd: "2026-11-26T08:00:00Z",
    },
  ];

  const events = [];
  let pr = 1000;
  const day0 = Date.parse("2026-10-29T08:00:00Z");
  const at = (dayIndex, hour) =>
    new Date(day0 + dayIndex * DAY + hour * HOUR).toISOString();
  const add = (who, iso) => {
    pr++;
    events.push({
      id: `demo-${pr}`,
      at: iso,
      login: `demo-${who}`,
      repo: "demo/app",
      pr,
      prTitle: `Demo PR ${pr}`,
      url: `https://example.invalid/pr/${pr}`,
    });
  };
  const weekday = (i) =>
    ![0, 6].includes(new Date(day0 + i * DAY + 12 * HOUR - PT).getUTCDay());
  const spread = (who, i, n) => {
    for (let k = 0; k < n; k++) add(who, at(i, 9 + rand() * 8));
  };
  const burst = (who, i, startHour, n, minutes = 50) => {
    for (let k = 0; k < n; k++)
      add(who, at(i, startHour + (k * minutes) / n / 60));
  };

  for (let i = 0; i < 14; i++) {
    const wd = weekday(i);
    if (wd) spread("ada", i, i < 7 ? 4 : 1);
    if (wd && i < 12) spread("ben", i, 1);
    if (wd) {
      spread("eli", i, 1);
    }
    if (!wd) spread("eli", i, 3);
  }
  burst("ben", 12, 10, 6);
  spread("ben", 12, 6);
  burst("ben", 13, 8, 8, 45);
  spread("ben", 13, 4);
  for (const who of ["cleo", "dev"]) {
    let left = 28;
    for (let i = 0; i < 14 && left > 0; i++)
      if (weekday(i)) {
        const n = Math.min(left, i % 2 ? 3 : 2);
        spread(who, i, n);
        left -= n;
      }
    while (left-- > 0) add(who, at(13, 9 + rand() * 2));
  }
  burst("gus", 8, 13, 5);
  burst("gus", 10, 10, 5);
  spread("gus", 11, 5);

  for (let i = 14; i < 21; i++)
    if (weekday(i))
      for (const m of members) spread(m.id, i, Math.floor(rand() * 4));
  return {
    id: "demo",
    name: "Demo team",
    githubOrg: "demo",
    lastPlaceEmoji: "💩",
    members,
    periods,
    events: events.filter((e) => Date.parse(e.at) < now.getTime()),
    refreshedAt: now.toISOString(),
  };
}
