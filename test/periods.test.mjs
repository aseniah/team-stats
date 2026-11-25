import assert from "node:assert/strict";
import { test } from "node:test";
import { periodFromSprint, syncSprints } from "../lib/periods.mjs";

const sprint = (id, name, startDate, extra = {}) => ({
  id,
  name,
  startDate,
  endDate: startDate && `${startDate.slice(0, 10)}T23:00:00.000Z`,
  originBoardId: 7,
  ...extra,
});
const numbered = {
  namePattern: "^Sprint (?<number>\\d+)",
  id: "sprint-{number}",
  label: "{number}",
};
const quarterly = {
  namePattern: "^[A-Z]+-(?<yy>\\d{2})Q(?<quarter>\\d)\\s+(?<number>\\d+)?",
  id: "sprint-{yy}q{quarter}-{number}",
  label: "{number}",
};

test("periodFromSprint fills id and label from named groups", () => {
  const p = periodFromSprint(
    sprint(501, "Sprint 12 Otters", "2026-03-01T00:00:00.000Z"),
    numbered,
  );
  assert.deepEqual(p, {
    id: "sprint-12",
    kind: "sprint",
    name: "Sprint 12 Otters",
    label: "12",
    jiraSprintId: 501,
    start: "2026-03-01T00:00:00.000Z",
    plannedEnd: "2026-03-01T23:00:00.000Z",
  });
  const q = periodFromSprint(
    sprint(502, "ABC-26Q4 23 Comet", "2026-11-01T00:00:00.000Z"),
    quarterly,
  );
  assert.equal(q.id, "sprint-26q4-23");
  assert.equal(q.label, "23");
});

test("periodFromSprint falls back to the Jira id and full name when a slot is missing", () => {
  const p = periodFromSprint(
    sprint(503, "ABC-26Q4 Comet", "2026-11-01T00:00:00.000Z"),
    quarterly,
  );
  assert.equal(p.id, "sprint-503");
  assert.equal(p.label, "ABC-26Q4 Comet");
  const d = periodFromSprint(
    sprint(504, "Anything", "2026-11-01T00:00:00.000Z"),
  );
  assert.equal(d.id, "sprint-504");
  assert.equal(d.label, "Anything");
});

test("syncSprints appends newer sprints from the board in start order and never touches older ones", () => {
  const periods = [
    {
      id: "old",
      kind: "sprint",
      name: "Sprint 1 Old",
      label: "1",
      jiraSprintId: 1,
      start: "2026-01-01T00:00:00.000Z",
      plannedEnd: "2026-01-15T00:00:00.000Z",
    },
  ];
  const sprints = [
    sprint(3, "Sprint 3 C", "2026-01-29T00:00:00.000Z"),
    sprint(2, "Sprint 2 B", "2026-01-15T00:00:00.000Z"),
    sprint(9, "Sprint 9 Other board", "2026-02-01T00:00:00.000Z", {
      originBoardId: 8,
    }),
    sprint(0, "Sprint 0 Earlier", "2025-12-01T00:00:00.000Z"),
    sprint(4, "Sprint 4 Future", null),
  ];
  const r = syncSprints(periods, sprints, { boardId: 7, naming: numbered });
  assert.deepEqual(r.added, ["sprint-2", "sprint-3"]);
  assert.deepEqual(
    r.periods.map((p) => p.id),
    ["old", "sprint-2", "sprint-3"],
  );
  assert.deepEqual(r.changed, []);
  assert.equal(periods.length, 1);
});

test("syncSprints updates the latest plannedEnd and avoids id collisions", () => {
  const periods = [
    {
      id: "sprint-5",
      kind: "sprint",
      name: "Sprint 5",
      jiraSprintId: 50,
      start: "2026-01-01T00:00:00.000Z",
      plannedEnd: "2026-01-15T00:00:00.000Z",
    },
  ];
  const r = syncSprints(
    periods,
    [
      sprint(50, "Sprint 5", "2026-01-01T00:00:00.000Z", {
        endDate: "2026-01-16T00:00:00.000Z",
      }),
      sprint(51, "Sprint 5 again", "2026-01-16T00:00:00.000Z"),
    ],
    { boardId: 7, naming: numbered },
  );
  assert.deepEqual(r.changed, ["sprint-5"]);
  assert.equal(r.periods[0].plannedEnd, "2026-01-16T00:00:00.000Z");
  assert.equal(r.periods[0].start, "2026-01-01T00:00:00.000Z");
  assert.deepEqual(r.added, ["sprint-51"]);
});

test("syncSprints never produces a duplicate id, even through the fallback", () => {
  const periods = [
    {
      id: "sprint-5",
      kind: "sprint",
      name: "Sprint 5",
      jiraSprintId: 50,
      start: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "sprint-51",
      kind: "sprint",
      name: "Sprint 51",
      jiraSprintId: 40,
      start: "2026-01-08T00:00:00.000Z",
    },
  ];
  const r = syncSprints(
    periods,
    [sprint(51, "Sprint 5 again", "2026-01-16T00:00:00.000Z")],
    { boardId: 7, naming: numbered },
  );
  const ids = r.periods.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
});
