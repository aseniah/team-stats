import assert from "node:assert/strict";
import {
  cpSync,
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
import { demoTeams } from "../lib/demo-teams.mjs";
import { buildPrReviews, buildSprintRace } from "../scripts/build-reports.mjs";
import { scenarioTeams } from "./fixtures/scenario-teams.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function writeExampleConfig(
  root,
  teams = JSON.parse(
    readFileSync(path.join(repo, "config/teams.example.json"), "utf8"),
  ),
) {
  mkdirSync(path.join(root, "config/periods"), { recursive: true });
  writeFileSync(path.join(root, "config/teams.json"), JSON.stringify(teams));
  for (const t of teams)
    cpSync(
      path.join(repo, "config/periods.example.json"),
      path.join(root, `config/periods/${t.id}.json`),
    );
}

test("buildPrReviews produces a self-contained page", () => {
  const root = mkdtempSync(path.join(tmpdir(), "teamstats-"));
  try {
    for (const p of ["lib", "reports/src"])
      cpSync(path.join(repo, p), path.join(root, p), { recursive: true });
    writeExampleConfig(root);
    mkdirSync(path.join(root, "data/platform/github/pr-review-events"), {
      recursive: true,
    });
    const rows = [
      {
        id: "a",
        at: "2026-11-05T00:00:00Z",
        login: "ada-gh",
        kind: "review",
        state: "APPROVED",
        repo: "acme/x",
        pr: 1,
        prAuthor: "ben-gh",
        prTitle: "Has </script> in it",
        url: "u",
      },
      {
        id: "b",
        at: "2026-11-06T00:00:00Z",
        login: "ben-gh",
        kind: "review",
        state: "COMMENTED",
        repo: "acme/x",
        pr: 2,
        prAuthor: "ada-gh",
        prTitle: "Two $& dollars <!--<script>",
        url: "u",
      },
    ];
    writeFileSync(
      path.join(root, "data/platform/github/pr-review-events/2026-11.jsonl"),
      `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`,
    );
    const html = buildPrReviews({
      root,
      now: new Date("2026-11-18T12:00:00Z"),
    });
    assert.ok(!html.includes("{{"));
    assert.ok(!/\bexport function\b/.test(html));
    assert.ok(!/<script[^>]+src=/i.test(html));
    assert.ok(!/<link[^>]+href=/i.test(html));
    const dataBlock = html.match(
      /<script id="data" type="application\/json">([\s\S]*?)<\/script>/,
    )[1];
    assert.ok(
      !dataBlock.includes("<"),
      "data block has no raw < that could change how the HTML parser reads it",
    );
    assert.equal(
      JSON.parse(dataBlock).teams[0].events[1].prTitle,
      "Two $& dollars <!--<script>",
    );
    const opens = html.match(/<script\b/gi).length;
    const closes = html.match(/<\/script>/gi).length;
    assert.equal(opens, closes);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("buildPrReviews works from the example config with no data yet", () => {
  const root = mkdtempSync(path.join(tmpdir(), "teamstats-"));
  try {
    for (const p of ["lib", "reports/src"])
      cpSync(path.join(repo, p), path.join(root, p), { recursive: true });
    writeExampleConfig(root);
    const html = buildPrReviews({
      root,
      now: new Date("2026-11-20T12:00:00Z"),
    });
    assert.equal(embedded(html).teams[0].name, "Platform");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function exampleRoot() {
  const root = mkdtempSync(path.join(tmpdir(), "teamstats-"));
  for (const p of ["lib", "reports/src"])
    cpSync(path.join(repo, p), path.join(root, p), { recursive: true });
  writeExampleConfig(root);
  return root;
}
const embedded = (html) =>
  JSON.parse(
    html.match(
      /<script id="data" type="application\/json">([\s\S]*?)<\/script>/,
    )[1],
  );

test("buildSprintRace produces a self-contained page", () => {
  const root = exampleRoot();
  try {
    const html = buildSprintRace({
      root,
      now: new Date("2026-11-20T12:00:00Z"),
    });
    assert.ok(!html.includes("{{"));
    assert.ok(!/\bexport (function|const)\b/.test(html));
    assert.ok(!/<script[^>]+src=/i.test(html));
    assert.equal(
      html.match(/<script\b/gi).length,
      html.match(/<\/script>/gi).length,
    );
    assert.ok(html.includes("RACE_THEMES.cars"));
    assert.equal(embedded(html).teams[0].name, "Platform");
    assert.deepEqual(
      embedded(html).reports.map((r) => r.href),
      ["pr-reviews.html", "sprint-race.html"],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the demo and scenario builds need no config", () => {
  const root = mkdtempSync(path.join(tmpdir(), "teamstats-"));
  try {
    for (const p of ["lib", "reports/src"])
      cpSync(path.join(repo, p), path.join(root, p), { recursive: true });
    const now = new Date("2026-11-20T12:00:00Z");
    const demo = embedded(
      buildSprintRace({ root, now, teams: demoTeams(now) }),
    );
    assert.deepEqual(
      demo.teams.map((t) => [t.id, t.members.length]),
      [
        ["platform", 7],
        ["mobile", 4],
      ],
    );
    assert.deepEqual(
      demo.reports.map((r) => r.href),
      ["pr-reviews.html", "sprint-race.html"],
    );
    const scenarios = embedded(
      buildPrReviews({ root, now, teams: scenarioTeams(now) }),
    );
    assert.deepEqual(
      scenarios.teams.map((t) => t.members.length),
      [7, 3],
    );
    assert.ok(scenarios.teams[0].events.length > 100);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("buildPrReviews links to the race, defines ten person colors and uses avatars, not race themes", () => {
  const root = exampleRoot();
  try {
    const html = buildPrReviews({
      root,
      now: new Date("2026-11-20T12:00:00Z"),
    });
    assert.ok(html.includes("--series-10"));
    assert.ok(!html.includes("RACE_THEMES"));
    assert.ok(html.includes('class="avatar"'));
    assert.ok(!html.includes("{{"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a two-team build embeds each team with its own events", () => {
  const root = mkdtempSync(path.join(tmpdir(), "teamstats-"));
  try {
    for (const p of ["lib", "reports/src"])
      cpSync(path.join(repo, p), path.join(root, p), { recursive: true });
    const base = JSON.parse(
      readFileSync(path.join(repo, "config/teams.example.json"), "utf8"),
    )[0];
    writeExampleConfig(root, [
      base,
      { ...base, id: "second", name: "Second", lastPlaceEmoji: null },
    ]);
    for (const [id, login] of [
      ["platform", "ada-gh"],
      ["second", "ben-gh"],
    ]) {
      mkdirSync(path.join(root, `data/${id}/github/pr-review-events`), {
        recursive: true,
      });
      writeFileSync(
        path.join(root, `data/${id}/github/pr-review-events/2026-11.jsonl`),
        `${JSON.stringify({ id: `${id}-1`, at: "2026-11-05T00:00:00Z", login, repo: "acme/x", pr: 1, prTitle: "t", url: "u" })}\n`,
      );
    }
    const data = embedded(
      buildPrReviews({ root, now: new Date("2026-11-20T12:00:00Z") }),
    );
    assert.deepEqual(
      data.teams.map((t) => [t.id, t.events.map((e) => e.id)]),
      [
        ["platform", ["platform-1"]],
        ["second", ["second-1"]],
      ],
    );
    assert.equal(data.teams[1].lastPlaceEmoji, null);
    assert.equal(data.teams[0].periods.length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
