import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const dir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../reports/src/race-themes",
);
const PHRASE_LISTS = [
  "lead",
  "pass",
  "back",
  "tie",
  "boost",
  "weekend",
  "join",
  "leave",
  "start",
  "timeUp",
  "soFar",
  "checkered",
];
const FINISH = ["first", "second", "third", "middle", "last", "garage"];
const geometry = {
  width: 1200,
  height: 400,
  top: 30,
  lanes: 4,
  laneHeight: 74,
  labelWidth: 150,
  startX: 245,
  finishX: 1050,
};

function load(file) {
  const win = {};
  new Function("window", readFileSync(path.join(dir, file), "utf8"))(win);
  return win.RACE_THEMES;
}

function checkShape(t, id) {
  assert.equal(t.id, id);
  assert.ok(t.label);
  assert.ok(t.size?.w > 0 && t.size?.h > 0);
  const svg = t.racer("#123456", "AB", { wheel: "#777", ink: "#abcdef" });
  assert.ok(
    svg.includes("#123456") && svg.includes("AB") && svg.includes("#abcdef"),
    "racer draws the color, initials and initials ink",
  );
  assert.ok(t.field(geometry).includes("<"));
  assert.ok(t.effects.boost().includes("<"));
  assert.ok(t.start.lights > 0 && t.start.go && t.start.button);
  for (const k of ["grid", "weekendDay", "weekendFlag", "title", "results"])
    assert.ok(t.words[k], `words.${k}`);
  assert.ok(
    t.words.title.includes("{name}") && t.words.results.includes("{name}"),
  );
  for (const k of PHRASE_LISTS)
    assert.ok(
      Array.isArray(t.phrases[k]) && t.phrases[k].length,
      `phrases.${k}`,
    );
  for (const k of FINISH)
    assert.ok(
      t.phrases.finish[k]?.one && t.phrases.finish[k]?.shared,
      `finish.${k}`,
    );
  for (const v of Object.values(t.phrases.finish.last))
    assert.ok(
      v.includes("{last}") && !v.includes("💩"),
      "finish.last uses the {last} slot",
    );
  const keys = Object.keys(t.palette.light).sort();
  assert.deepEqual(Object.keys(t.palette.dark).sort(), keys);
  for (const k of [
    "stage",
    "stageStripe",
    "pitwall",
    "ground",
    "tick",
    "text",
    "weekendDay",
    "weekendText",
    "labelText",
    "labelSub",
    "dayText",
    "dayLine",
    "marker",
  ])
    assert.ok(keys.includes(k), `palette.${k}`);
  const { light, dark } = t.palette;
  assert.ok(
    luminance(light.pitwall) > 0.6 && luminance(light.labelText) < 0.2,
    "light mode has a light name panel with dark names",
  );
  assert.ok(
    luminance(light.stage) > luminance(dark.stage),
    "light mode stage is lighter than dark mode",
  );
  assert.ok(luminance(dark.labelText) > 0.6, "dark mode keeps light names");
}

function luminance(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  assert.ok(m, `${hex} is a 6 digit hex color`);
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

test("cars theme registers the required shape", () => {
  assert.ok(readdirSync(dir).includes("cars.js"));
  checkShape(load("cars.js").cars, "cars");
});

test("horses and sleds themes register the required shape", () => {
  checkShape(load("horses.js").horses, "horses");
  checkShape(load("sleds.js").sleds, "sleds");
});

test("every theme file registers under its file name", () => {
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".js"))) {
    const id = f.replace(/\.js$/, "");
    checkShape(load(f)[id], id);
  }
});
