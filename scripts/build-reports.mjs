#!/usr/bin/env node
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { demoTeams } from "../lib/demo-teams.mjs";
import { styler } from "../lib/style.mjs";
import { loadTeam, readTeamsFile } from "../lib/team-config.mjs";
import { scenarioTeams } from "../test/fixtures/scenario-teams.mjs";

const defaultRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const PAGE_FIELDS = [
  "id",
  "at",
  "login",
  "repo",
  "pr",
  "prTitle",
  "url",
  "excluded",
];
const RACE_FIELDS = ["id", "at", "login", "repo", "pr", "excluded"];
const TEAM_FIELDS = [
  "id",
  "name",
  "githubOrg",
  "lastPlaceEmoji",
  "members",
  "periods",
  "refreshedAt",
];

// Every report gets a nav link in every page's top bar, in this order.
export const REPORTS = [
  { id: "pr-reviews", title: "Leaderboard", file: "pr-reviews.html" },
  { id: "sprint-race", title: "Sprint race", file: "sprint-race.html" },
];

const inlineScript = (source) => source.replace(/<\/script/gi, "<\\/script");
// Escaping every `<` keeps titles like `<!--<script>` from changing how the HTML parser reads the data block.
const inlineJson = (data) => JSON.stringify(data).replace(/</g, "\\u003c");
const pick = (fields) => (e) =>
  Object.fromEntries(
    fields.filter((k) => e[k] !== undefined).map((k) => [k, e[k]]),
  );

function sources(root) {
  const read = (p) => readFileSync(path.join(root, p), "utf8");
  return {
    read,
    lib: (p) => inlineScript(read(p).replace(/^export /gm, "")),
  };
}

const loadTeams = (root) => readTeamsFile(root).map((t) => loadTeam(root, t));

function pageData(loaded, { id, now, fields }) {
  const teams = loaded.map((t) => ({
    ...Object.fromEntries(
      TEAM_FIELDS.filter((k) => t[k] !== undefined).map((k) => [k, t[k]]),
    ),
    events: t.events.map(pick(fields)),
  }));
  const reports = REPORTS.map((r) => ({
    id: r.id,
    title: r.title,
    href: r.file,
  }));
  return { teams, reports, current: id, builtAt: now.toISOString() };
}

// Split/join instead of String.replace so `$&`-style sequences in the sources are left alone.
const fillTemplate = (template, slots) =>
  Object.entries(slots).reduce(
    (html, [k, v]) => html.split(`{{${k}}}`).join(v),
    template,
  );

function themeSources(root) {
  const dir = path.join(root, "reports/src/race-themes");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".js"))
    .sort((a, b) =>
      a === "cars.js" ? -1 : b === "cars.js" ? 1 : a.localeCompare(b),
    );
  return files.map((f) => readFileSync(path.join(dir, f), "utf8")).join("\n");
}

// Pass `teams` to reuse one read of every team's data across pages.
export function buildPrReviews({
  root = defaultRoot,
  now = new Date(),
  teams = loadTeams(root),
} = {}) {
  const src = sources(root);
  const data = pageData(teams, {
    id: "pr-reviews",
    now,
    fields: PAGE_FIELDS,
  });
  return fillTemplate(src.read("reports/src/pr-reviews.html"), {
    SHARED_CSS: src.read("reports/src/shared.css"),
    DATA: inlineJson(data),
    PAGE_UTILS: src.lib("lib/page-utils.mjs"),
    STATS_LIB: src.lib("lib/review-stats.mjs"),
    PAGE_JS: inlineScript(src.read("reports/src/pr-reviews.js")),
  });
}

export function buildSprintRace({
  root = defaultRoot,
  now = new Date(),
  teams = loadTeams(root),
} = {}) {
  const src = sources(root);
  const data = pageData(teams, {
    id: "sprint-race",
    now,
    fields: RACE_FIELDS,
  });
  return fillTemplate(src.read("reports/src/sprint-race.html"), {
    SHARED_CSS: src.read("reports/src/shared.css"),
    DATA: inlineJson(data),
    PAGE_UTILS: src.lib("lib/page-utils.mjs"),
    STATS_LIB: src.lib("lib/review-stats.mjs"),
    RACE_ENGINE: src.lib("lib/race-engine.mjs"),
    THEMES: inlineScript(themeSources(root)),
    PAGE_JS: inlineScript(src.read("reports/src/sprint-race.js")),
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const style = styler(process.stdout);
  const write = (rel, html) => {
    writeFileSync(path.join(defaultRoot, rel), html);
    console.log(
      `${style.green("✓")} ${rel} ${style.dim(`${Math.round(html.length / 1024)} KB`)}`,
    );
  };
  const builders = {
    "pr-reviews": buildPrReviews,
    "sprint-race": buildSprintRace,
  };
  // `--demo` and `--scenarios` build only invented teams, so they never need a config.
  const outputs = process.argv.includes("--demo")
    ? [["docs/demo", demoTeams]]
    : process.argv.includes("--scenarios")
      ? [["test/output", scenarioTeams]]
      : [["reports", () => loadTeams(defaultRoot)]];
  try {
    const now = new Date();
    for (const [dir, load] of outputs) {
      const teams = load(now);
      mkdirSync(path.join(defaultRoot, dir), { recursive: true });
      for (const r of REPORTS)
        write(`${dir}/${r.file}`, builders[r.id]({ now, teams }));
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
