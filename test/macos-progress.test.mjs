import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { progressBoard } from "../lib/progress.mjs";

const helper = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../macos/progress.sh",
);
const dir = mkdtempSync(path.join(tmpdir(), "macos-progress-"));

// Builds a log the way refresh.sh writes one when its output is not a terminal.
function logOf(steps) {
  let text = "";
  const out = {
    isTTY: false,
    write(s) {
      text += s;
    },
  };
  for (const [title, run] of steps) {
    text += `\n▸ ${title}\n`;
    run?.(progressBoard(["Acme", "Beta", "Gamma"], { out }));
  }
  return text;
}

function report(log) {
  const file = path.join(dir, "refresh.log");
  writeFileSync(file, log);
  return execFileSync("sh", [helper, file], { encoding: "utf8" }).trimEnd();
}

const syncAll = (b) => {
  b.begin();
  for (const i of [0, 1, 2]) b.start(i);
  for (const i of [0, 1, 2]) b.done(i, "no changes");
  b.end();
};

test("an empty log is starting", () => {
  assert.equal(report(""), "0\tStarting");
});

test("the first step counts its teams as they finish", () => {
  const log = logOf([
    [
      "Sync sprints from Jira",
      (b) => {
        for (const i of [0, 1, 2]) b.start(i);
        b.done(1, "no changes");
      },
    ],
  ]);
  assert.equal(
    report(log),
    "11\tSync sprints from Jira · 1 of 3 teams · Acme, Gamma",
  );
});

test("the second step names the teams still running and counts failures as finished", () => {
  const log = logOf([
    ["Sync sprints from Jira", syncAll],
    [
      "Refresh PR reviews from GitHub",
      (b) => {
        b.start(0);
        b.start(1);
        b.failed(0, "bad credentials");
        b.start(2);
      },
    ],
  ]);
  assert.equal(
    report(log),
    "44\tRefresh PR reviews from GitHub · 1 of 3 teams · Beta, Gamma",
  );
});

test("the build step shows only its title", () => {
  const log = logOf([
    ["Sync sprints from Jira", syncAll],
    ["Refresh PR reviews from GitHub", syncAll],
    ["Build reports"],
  ]);
  assert.equal(report(log), "66\tBuild reports");
});
