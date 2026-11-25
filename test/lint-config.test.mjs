import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(repo, p), "utf8");
const INLINED = [
  "lib/page-utils.mjs",
  "lib/review-stats.mjs",
  "lib/race-engine.mjs",
];

test("the page script globals in biome.json are exactly the inlined libs' exports", () => {
  const exported = INLINED.flatMap((p) =>
    [...read(p).matchAll(/^export (?:function|const) (\w+)/gm)].map(
      (m) => m[1],
    ),
  );
  const { overrides } = JSON.parse(read("biome.json"));
  const globals = overrides.find((o) => o.includes.includes("reports/src/*.js"))
    .javascript.globals;
  assert.deepEqual([...globals].sort(), [...new Set(exported)].sort());
});

test("inlined libs have no imports and export only functions and constants", () => {
  for (const p of INLINED) {
    const src = read(p);
    assert.ok(!/^import\b/m.test(src), `${p} imports`);
    assert.ok(
      !/^export (?!function |const )/m.test(src),
      `${p} exports something else`,
    );
  }
});
