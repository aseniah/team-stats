import assert from "node:assert/strict";
import { test } from "node:test";
import { progressBoard } from "../lib/progress.mjs";
import { styler } from "../lib/style.mjs";

const sink = (isTTY, columns) => {
  const out = {
    isTTY,
    columns,
    text: "",
    write(s) {
      out.text += s;
    },
  };
  return out;
};

test("without a terminal it prints each start and finish once", () => {
  const out = sink(false);
  const board = progressBoard(["Acme", "Beta", "Gamma"], { out });
  board.begin();
  board.start(0);
  board.update(0, "fetching PRs 50/100");
  board.done(0, "100 PRs");
  board.start(1);
  board.failed(1, "bad credentials");
  board.skipped(2, "not refreshed");
  board.end();
  assert.equal(
    out.text,
    [
      "Acme: started",
      "✓ Acme: 100 PRs",
      "Beta: started",
      "✗ Beta: bad credentials",
      "– Gamma: not refreshed",
      "",
    ].join("\n"),
  );
});

test("on a terminal it redraws every line in place and truncates to the width", () => {
  const out = sink(true, 20);
  const board = progressBoard(["Acme", "Beta"], {
    out,
    intervalMs: 1e6,
    style: styler(out, { NO_COLOR: "1" }),
  });
  board.begin();
  board.start(0);
  board.done(0, "a very long status that overflows");
  board.end();
  const frames = out.text.split("\x1b[2A");
  assert.equal(frames.length, 2);
  assert.equal(
    frames[1],
    "\x1b[2K✓ Acme: a very lon…\n\x1b[2K· Beta: waiting\n",
  );
});

test("on a color terminal it colors the mark and truncates by visible width", () => {
  const out = sink(true, 20);
  const board = progressBoard(["Acme"], {
    out,
    intervalMs: 1e6,
    style: styler(out, {}),
  });
  board.begin();
  board.done(0, "a very long status that overflows");
  board.end();
  const last = out.text.split("\x1b[1A").at(-1);
  assert.equal(
    last,
    "\x1b[2K\x1b[32m✓\x1b[39m \x1b[1mAcme\x1b[22m: \x1b[2ma very lon…\x1b[22m\n",
  );
});

test("styler is plain off a terminal, with NO_COLOR, and forced on by FORCE_COLOR", () => {
  assert.equal(styler({ isTTY: false }, {}).red("x"), "x");
  assert.equal(styler({ isTTY: true }, { NO_COLOR: "1" }).red("x"), "x");
  assert.equal(
    styler({ isTTY: false }, { FORCE_COLOR: "1" }).red("x"),
    "\x1b[31mx\x1b[39m",
  );
  assert.equal(styler({ isTTY: true }, {}).bold("x"), "\x1b[1mx\x1b[22m");
});
