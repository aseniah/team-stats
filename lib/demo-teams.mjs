// Invented teams for the published demo. Sprints are placed relative to `now`, and the same `now` gives the same data.
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const SPRINT_DAYS = 14;
const WORKDAYS = 10;

function rng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TITLES = [
  "Add retries to the webhook sender",
  "Cache the account lookup",
  "Fix timezone in the weekly digest",
  "Move billing jobs to the new queue",
  "Paginate the audit log",
  "Drop the legacy export flag",
  "Show a spinner while invoices load",
  "Tighten the rate limiter",
  "Split the search index by region",
  "Log slow queries",
  "Handle empty carts at checkout",
  "Upgrade the image resizer",
  "Add a health check for the worker",
  "Rename the settings page",
  "Speed up the nightly report",
  "Validate uploads before parsing",
];

const TEAMS = [
  {
    id: "platform",
    name: "Platform",
    seed: 66,
    firstSprint: 41,
    lastPlaceEmoji: "💩",
    tiedSprint: 43,
    repos: ["acme/api", "acme/billing", "acme/workers"],
    members: [
      ["maya", "Maya Chen", 2.2],
      ["theo", "Theodore Grant", 1.9, "Theo"],
      ["priya", "Priya Shah", 1.7],
      ["sam", "Sam Rivera", 1.5],
      ["noor", "Noor Haddad", 1.3],
      ["leo", "Leo Becker", 1.1],
      ["ines", "Ines Duarte", 0.6],
    ],
  },
  {
    id: "mobile",
    name: "Mobile",
    seed: 17,
    firstSprint: 12,
    repos: ["acme/ios", "acme/android"],
    members: [
      ["kai", "Kai Morgan", 1.8],
      ["rosa", "Rosa Lind", 1.5],
      ["omar", "Omar Farah", 1.2],
      ["jun", "Jun Park", 0.9],
    ],
  },
];

function poisson(rand, mean) {
  const limit = Math.exp(-mean);
  let n = 0;
  for (let p = rand(); p > limit; p *= rand()) n++;
  return n;
}

function gaussian(rand) {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}

// One person's expected reviews for each workday of one sprint, counted from 0: their usual rate, scaled by how this sprint is going for them, how their focus moves across it, time off and the odd catch-up day.
function dailyPace(rand, rate) {
  let form = Math.exp(0.25 * gaussian(rand));
  if (rand() < 0.08) form *= 1.4 + rand() * 0.4;
  if (rand() < 0.08) form *= 0.5;
  const from = 0.5 + rand();
  const to = 0.5 + rand();
  const off = new Set();
  if (rand() < 0.12) {
    const first = Math.floor(rand() * WORKDAYS);
    const length = 3 + Math.floor(rand() * 5);
    for (let d = first; d < first + length; d++) off.add(d);
  }
  for (let k = 0; k < 2; k++)
    if (rand() < 0.2) off.add(Math.floor(rand() * WORKDAYS));
  const bursts = new Map();
  for (let d = 0; d < WORKDAYS; d++)
    if (rand() < 0.04) bursts.set(d, 2 + rand() * 3);
  return (d) =>
    off.has(d)
      ? 0
      : rate * form * (from + ((to - from) * d) / (WORKDAYS - 1)) +
        (bursts.get(d) ?? 0);
}

// Breaks ties among the top three and at last place, so every sprint has a clear podium.
function separate(counts, add) {
  for (let guard = 0; guard < 50; guard++) {
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const tie =
      [0, 1, 2].find((i) => ranked[i][1] === ranked[i + 1][1]) ??
      (ranked.at(-1)[1] === ranked.at(-2)[1] ? ranked.length - 2 : null);
    if (tie == null) return;
    add(ranked[tie][0]);
    counts[ranked[tie][0]]++;
  }
}

function demoTeam(spec, now) {
  const rand = rng(spec.seed);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const today = Date.parse(new Date(now).toISOString().slice(0, 10));
  const currentStart = today - 5 * DAY + 16 * HOUR;
  const periods = Array.from({ length: 6 }, (_, i) => {
    const n = spec.firstSprint + i;
    const start = currentStart - (5 - i) * SPRINT_DAYS * DAY;
    return {
      id: `sprint-${n}`,
      kind: "sprint",
      name: `Sprint ${n}`,
      label: String(n),
      start: new Date(start).toISOString(),
      plannedEnd: new Date(start + SPRINT_DAYS * DAY).toISOString(),
    };
  });
  const members = spec.members.map(([id, name, , displayName]) => ({
    id,
    name,
    ...(displayName && { displayName }),
    github: `${id}-gh`,
    from: periods[0].start.slice(0, 10),
    to: null,
  }));

  const events = [];
  let pr = 1200;
  const add = (login, t, repeatOf) => {
    const n = repeatOf ?? ++pr;
    const repo = repeatOf ? repeatOf.repo : pick(spec.repos);
    const ev = {
      id: `${spec.id}-${events.length + 1}`,
      at: new Date(t).toISOString(),
      login,
      repo,
      pr: repeatOf ? repeatOf.pr : n,
      prTitle: repeatOf ? repeatOf.prTitle : TITLES[n % TITLES.length],
      url: `https://example.invalid/${repo}/pull/${repeatOf ? repeatOf.pr : n}`,
    };
    events.push(ev);
    return ev;
  };
  const workday = (start, day) => {
    const t = start + day * DAY;
    return ![0, 6].includes(new Date(t).getUTCDay());
  };
  const workTime = (start, day) => start + day * DAY + rand() * 7 * HOUR;
  // Uses no rand() so the sprints after the tied one come out the same as without it.
  const tieSecond = (counts, start, workdays) => {
    const [, second, third] = Object.entries(counts).sort(
      (a, b) => b[1] - a[1],
    );
    for (let k = 0; third[1] + k < second[1]; k++)
      add(
        third[0],
        start + workdays[k % workdays.length] * DAY + (k % 7) * HOUR,
      );
    counts[third[0]] = second[1];
  };

  for (const p of periods) {
    const start = Date.parse(p.start);
    const days = Math.min(SPRINT_DAYS, Math.floor((now - start) / DAY));
    const counts = {};
    for (const [id, , rate] of spec.members) {
      const login = `${id}-gh`;
      const pace = dailyPace(rand, rate);
      const mine = [];
      counts[login] = 0;
      for (let d = 0, w = 0; d < days; d++) {
        if (!workday(start, d)) continue;
        const n = poisson(rand, pace(w++));
        for (let k = 0; k < n; k++) {
          const again = mine.length && rand() < 0.12 ? pick(mine) : undefined;
          mine.push(add(login, workTime(start, d), again));
          counts[login]++;
        }
      }
    }
    const workdays = Array.from({ length: days }, (_, d) => d).filter((d) =>
      workday(start, d),
    );
    if (!workdays.length) continue;
    separate(counts, (login) => add(login, workTime(start, pick(workdays))));
    if (p.id === `sprint-${spec.tiedSprint}`)
      tieSecond(counts, start, workdays);
  }

  return {
    id: spec.id,
    name: spec.name,
    githubOrg: "acme",
    ...(spec.lastPlaceEmoji && { lastPlaceEmoji: spec.lastPlaceEmoji }),
    members,
    periods,
    events: events.filter((e) => Date.parse(e.at) < now.getTime()),
    refreshedAt: now.toISOString(),
  };
}

export function demoTeams(now = new Date()) {
  return TEAMS.map((spec) => demoTeam(spec, now));
}
