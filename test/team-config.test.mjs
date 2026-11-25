import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  LegacyLayoutError,
  loadTeam,
  readTeamsFile,
  selectTeams,
  teamArg,
  teamPaths,
} from "../lib/team-config.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const team = (id, extra = {}) => ({
  id,
  name: id,
  githubOrg: "acme",
  members: [],
  ...extra,
});

function withRoot(fn) {
  const root = mkdtempSync(path.join(tmpdir(), "teamstats-cfg-"));
  mkdirSync(path.join(root, "config"));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
const writeTeams = (root, teams) =>
  writeFileSync(path.join(root, "config/teams.json"), JSON.stringify(teams));

test("teamPaths keeps each team in its own folders", () => {
  const a = teamPaths("/r", "alpha");
  const b = teamPaths("/r", "beta");
  assert.equal(a.periodsFile, path.join("/r", "config/periods/alpha.json"));
  assert.equal(
    a.eventsDir,
    path.join("/r", "data/alpha/github/pr-review-events"),
  );
  for (const k of Object.keys(a))
    assert.ok(!b[k].startsWith(a.dataDir) && a[k] !== b[k]);
});

test("readTeamsFile points at the migration when only the old layout exists", () =>
  withRoot((root) => {
    writeFileSync(path.join(root, "config/team.json"), "{}");
    assert.throws(
      () => readTeamsFile(root),
      (e) =>
        e instanceof LegacyLayoutError && /migrate-single-team/.test(e.message),
    );
  }));

test("readTeamsFile rejects bad and repeated ids", () =>
  withRoot((root) => {
    writeTeams(root, [team("Bad Id")]);
    assert.throws(() => readTeamsFile(root), /lowercase/);
    writeTeams(root, [team("a"), team("a")]);
    assert.throws(() => readTeamsFile(root), /repeats/);
    writeTeams(root, [team("a", { githubOrg: "" })]);
    assert.throws(() => readTeamsFile(root), /githubOrg/);
  }));

test("loadTeam reads only its own periods, events and state", () =>
  withRoot((root) => {
    for (const id of ["a", "b"]) {
      const p = teamPaths(root, id);
      mkdirSync(path.dirname(p.periodsFile), { recursive: true });
      mkdirSync(p.eventsDir, { recursive: true });
      writeFileSync(
        p.periodsFile,
        JSON.stringify([{ id: `${id}-1`, start: "2026-11-01T00:00:00Z" }]),
      );
      writeFileSync(
        path.join(p.eventsDir, "2026-11.jsonl"),
        `${JSON.stringify({ id: `${id}-ev`, at: "2026-11-02T00:00:00Z" })}\n`,
      );
      writeFileSync(
        p.stateFile,
        JSON.stringify({
          refreshedAt: `2026-11-0${id === "a" ? 3 : 4}T00:00:00Z`,
        }),
      );
    }
    const a = loadTeam(root, team("a"));
    assert.deepEqual(
      a.periods.map((p) => p.id),
      ["a-1"],
    );
    assert.deepEqual(
      a.events.map((e) => e.id),
      ["a-ev"],
    );
    assert.equal(a.refreshedAt, "2026-11-03T00:00:00Z");
    assert.deepEqual(loadTeam(root, team("c")).periods, []);
  }));

test("selectTeams and teamArg", () => {
  const teams = [team("a"), team("b")];
  assert.equal(selectTeams(teams, null).length, 2);
  assert.deepEqual(
    selectTeams(teams, "b").map((t) => t.id),
    ["b"],
  );
  assert.throws(() => selectTeams(teams, "z"), /Teams: a, b/);
  assert.equal(teamArg(["--team", "b"]), "b");
  assert.equal(teamArg([]), null);
  assert.throws(() => teamArg(["--team"]), /needs a team id/);
});

test("migrate-single-team moves config, periods and data into the team layout", () =>
  withRoot((root) => {
    writeFileSync(
      path.join(root, "config/team.json"),
      JSON.stringify({ team: "Platform", githubOrg: "acme", members: [] }),
    );
    writeFileSync(path.join(root, "config/periods.json"), "[]");
    mkdirSync(path.join(root, "data/github/pr-review-events"), {
      recursive: true,
    });
    writeFileSync(path.join(root, "data/github/state.json"), "{}");
    execFileSync(
      process.execPath,
      [path.join(repo, "scripts/migrate-single-team.mjs"), "platform"],
      { env: { ...process.env, TEAMSTATS_ROOT: root }, stdio: "pipe" },
    );
    assert.deepEqual(
      readTeamsFile(root).map((t) => [t.id, t.name, t.team]),
      [["platform", "Platform", undefined]],
    );
    const p = teamPaths(root, "platform");
    assert.ok(
      existsSync(p.periodsFile) &&
        existsSync(p.stateFile) &&
        existsSync(p.eventsDir),
    );
    assert.ok(
      !existsSync(path.join(root, "config/team.json")) &&
        existsSync(path.join(root, "config/team.json.migrated")),
    );
    assert.equal(readFileSync(p.periodsFile, "utf8"), "[]");
  }));
