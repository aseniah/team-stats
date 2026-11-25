import assert from "node:assert/strict";
import { test } from "node:test";
import { refreshWindow } from "../lib/refresh-window.mjs";

const periods = ["2026-09-01", "2026-09-15", "2026-09-29", "2026-10-13"].map(
  (d, i) => ({ id: `s${i}`, start: `${d}T00:00:00.000Z` }),
);
const [s0, , s2, s3] = periods.map((p) => p.start);

test("a team's first refresh backfills every period", () => {
  assert.deepEqual(refreshWindow(periods, null), {
    since: s0,
    coveredFrom: s0,
  });
});

test("a steady refresh re-fetches the current and previous period", () => {
  const state = { refreshedAt: "2026-10-20T00:00:00.000Z", coveredFrom: s0 };
  assert.deepEqual(refreshWindow(periods, state), {
    since: s2,
    coveredFrom: s0,
  });
});

test("a gap since the last refresh starts at the period it ended in", () => {
  const state = { refreshedAt: "2026-09-20T00:00:00.000Z", coveredFrom: s0 };
  assert.equal(refreshWindow(periods, state).since, periods[1].start);
});

test("periods added before the covered range are backfilled", () => {
  const state = { refreshedAt: "2026-10-20T00:00:00.000Z", coveredFrom: s2 };
  assert.deepEqual(refreshWindow(periods, state), {
    since: s0,
    coveredFrom: s0,
  });
});

test("a state.json without coveredFrom does not trigger a backfill", () => {
  const state = { refreshedAt: "2026-10-20T00:00:00.000Z", since: s2 };
  assert.deepEqual(refreshWindow(periods, state), {
    since: s2,
    coveredFrom: s0,
  });
});

test("an explicit since is used as given and widens coverage", () => {
  const state = { refreshedAt: "2026-10-20T00:00:00.000Z", coveredFrom: s2 };
  const since = "2026-08-01T00:00:00.000Z";
  assert.deepEqual(refreshWindow(periods, state, since), {
    since,
    coveredFrom: since,
  });
  assert.deepEqual(refreshWindow(periods, state, s3), {
    since: s3,
    coveredFrom: s2,
  });
});
