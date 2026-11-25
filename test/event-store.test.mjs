import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  mergeMonth,
  monthKey,
  readEvents,
  writeWindow,
} from "../lib/event-store.mjs";

function ev(id, at, extra = {}) {
  return {
    id,
    at,
    login: "ada",
    kind: "review",
    state: "APPROVED",
    repo: "widgets",
    pr: 1,
    prAuthor: "sam",
    prTitle: "Add thing",
    url: `https://github.com/acme/widgets/pull/1#${id}`,
    ...extra,
  };
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "event-store-"));
}

test("monthKey uses UTC", () => {
  assert.equal(monthKey("2026-10-31T23:59:59.999Z"), "2026-10");
  assert.equal(monthKey("2026-11-01T00:00:00.000Z"), "2026-11");
  assert.equal(monthKey("2026-10-31T20:00:00.000-05:00"), "2026-11");
});

test("mergeMonth keeps pre-since rows and replaces post-since rows", () => {
  const since = "2026-11-10T00:00:00.000Z";
  const existing = [
    ev("old-1", "2026-11-02T00:00:00.000Z"),
    ev("stale", "2026-11-12T00:00:00.000Z"),
    ev("dup", "2026-11-11T00:00:00.000Z", { state: "COMMENTED" }),
  ];
  const fresh = [
    ev("new-1", "2026-11-15T00:00:00.000Z"),
    ev("dup", "2026-11-11T00:00:00.000Z", { state: "APPROVED" }),
  ];
  const merged = mergeMonth(existing, fresh, since);
  assert.deepEqual(
    merged.map((e) => e.id),
    ["old-1", "dup", "new-1"],
  );
  assert.equal(merged.find((e) => e.id === "dup").state, "APPROVED");
});

test("mergeMonth dedupes by id with fresh winning and sorts by at then id", () => {
  const since = "2026-11-10T00:00:00.000Z";
  const existing = [ev("a", "2026-11-01T00:00:00.000Z", { prTitle: "old" })];
  const fresh = [
    ev("c", "2026-11-12T00:00:00.000Z"),
    ev("b", "2026-11-12T00:00:00.000Z"),
    ev("a", "2026-11-01T00:00:00.000Z", { prTitle: "new" }),
  ];
  const merged = mergeMonth(existing, fresh, since);
  assert.deepEqual(
    merged.map((e) => e.id),
    ["a", "b", "c"],
  );
  assert.equal(merged[0].prTitle, "new");
});

test("writeWindow twice with the same input yields identical bytes", () => {
  const dir = tmpDir();
  try {
    const since = "2026-10-20T00:00:00.000Z";
    const now = new Date("2026-11-18T12:00:00.000Z");
    const fresh = [
      ev("r2", "2026-11-03T00:00:00.000Z", { excluded: "after-merge" }),
      ev("c1", "2026-10-25T00:00:00.000Z", { state: "COMMENTED" }),
      ev("r1", "2026-10-21T00:00:00.000Z"),
    ];
    const paths1 = writeWindow(dir, fresh, since, now);
    const bytes1 = paths1.map((p) => fs.readFileSync(p));
    const paths2 = writeWindow(dir, fresh, since, now);
    const bytes2 = paths2.map((p) => fs.readFileSync(p));
    assert.deepEqual(paths1, paths2);
    assert.deepEqual(
      paths1.map((p) => path.basename(p)),
      ["2026-10.jsonl", "2026-11.jsonl"],
    );
    assert.deepEqual(bytes1, bytes2);

    const oct = fs.readFileSync(path.join(dir, "2026-10.jsonl"), "utf8");
    assert.ok(oct.endsWith("\n"));
    const lines = oct.trimEnd().split("\n");
    assert.equal(lines.length, 2);
    assert.deepEqual(Object.keys(JSON.parse(lines[1])), [
      "id",
      "at",
      "login",
      "kind",
      "state",
      "repo",
      "pr",
      "prAuthor",
      "prTitle",
      "url",
    ]);
    assert.equal(JSON.parse(lines[1]).state, "COMMENTED");

    const nov = fs.readFileSync(path.join(dir, "2026-11.jsonl"), "utf8");
    assert.deepEqual(Object.keys(JSON.parse(nov.trimEnd())), [
      "id",
      "at",
      "login",
      "kind",
      "state",
      "repo",
      "pr",
      "prAuthor",
      "prTitle",
      "url",
      "excluded",
    ]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("writeWindow writes an empty file for a window month with no rows, replacing stale rows", () => {
  const dir = tmpDir();
  try {
    const since = "2026-09-01T00:00:00.000Z";
    const now = new Date("2026-11-18T12:00:00.000Z");
    writeWindow(dir, [ev("stale", "2026-10-05T00:00:00.000Z")], since, now);
    assert.notEqual(
      fs.readFileSync(path.join(dir, "2026-10.jsonl"), "utf8"),
      "",
    );

    const paths = writeWindow(
      dir,
      [ev("n1", "2026-11-05T00:00:00.000Z")],
      since,
      now,
    );
    assert.deepEqual(
      paths.map((p) => path.basename(p)),
      ["2026-09.jsonl", "2026-10.jsonl", "2026-11.jsonl"],
    );
    assert.equal(fs.readFileSync(path.join(dir, "2026-09.jsonl"), "utf8"), "");
    assert.equal(fs.readFileSync(path.join(dir, "2026-10.jsonl"), "utf8"), "");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("writeWindow keeps pre-since rows in the since month and leaves earlier months alone", () => {
  const dir = tmpDir();
  try {
    const now = new Date("2026-11-18T12:00:00.000Z");
    writeWindow(
      dir,
      [
        ev("sep", "2026-09-15T00:00:00.000Z"),
        ev("early-nov", "2026-11-02T00:00:00.000Z"),
        ev("late-nov", "2026-11-12T00:00:00.000Z"),
      ],
      "2026-09-01T00:00:00.000Z",
      now,
    );

    const paths = writeWindow(dir, [], "2026-11-10T00:00:00.000Z", now);
    assert.deepEqual(
      paths.map((p) => path.basename(p)),
      ["2026-11.jsonl"],
    );
    assert.deepEqual(
      readEvents(dir).map((e) => e.id),
      ["sep", "early-nov"],
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("writeWindow creates the directory if missing", () => {
  const root = tmpDir();
  try {
    const dir = path.join(root, "data", "github", "pr-review-events");
    writeWindow(
      dir,
      [ev("x", "2026-11-05T00:00:00.000Z")],
      "2026-11-01T00:00:00.000Z",
      new Date("2026-11-18T00:00:00.000Z"),
    );
    assert.ok(fs.existsSync(path.join(dir, "2026-11.jsonl")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("readEvents reads every jsonl file, skips blank lines and other files", () => {
  const dir = tmpDir();
  try {
    fs.writeFileSync(
      path.join(dir, "2026-10.jsonl"),
      `${JSON.stringify(ev("a", "2026-10-01T00:00:00.000Z"))}\n\n`,
    );
    fs.writeFileSync(
      path.join(dir, "2026-11.jsonl"),
      `\n${JSON.stringify(ev("b", "2026-11-01T00:00:00.000Z"))}\n`,
    );
    fs.writeFileSync(path.join(dir, "2026-12.jsonl"), "");
    fs.writeFileSync(path.join(dir, "notes.txt"), "not json");
    assert.deepEqual(
      readEvents(dir).map((e) => e.id),
      ["a", "b"],
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("readEvents returns [] for a missing directory", () => {
  assert.deepEqual(
    readEvents(path.join(os.tmpdir(), "event-store-does-not-exist-xyz")),
    [],
  );
});
