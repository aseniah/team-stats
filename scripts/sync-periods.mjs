#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  fetchBoardSprints,
  jiraAuth,
  jiraBase,
  tokenExpiryNotice,
} from "../lib/jira.mjs";
import { syncSprints } from "../lib/periods.mjs";
import { progressBoard } from "../lib/progress.mjs";
import { styler } from "../lib/style.mjs";
import {
  loadDotEnv,
  readTeamsFile,
  selectTeams,
  teamArg,
  teamPaths,
} from "../lib/team-config.mjs";

const s = styler(process.stdout);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const usage =
  "Usage: node scripts/sync-periods.mjs [--team <id>] (--from-jira | <sprints.json>). --from-jira reads every team (or the --team one) from the Jira API; a file needs --team when more than one team is configured.";

const readPeriods = (team) => {
  const { periodsFile } = teamPaths(root, team.id);
  return existsSync(periodsFile)
    ? JSON.parse(readFileSync(periodsFile, "utf8"))
    : [];
};

// A team with no periods yet is seeded from at most the last 12 months of sprints.
function fetchSince(periods, now = Date.now()) {
  const latest = periods.reduce(
    (a, p) => (a == null || Date.parse(p.start) > Date.parse(a) ? p.start : a),
    null,
  );
  return latest ?? new Date(now - 365 * 864e5).toISOString();
}

function syncTeam(team, sprints) {
  const { periodsFile } = teamPaths(root, team.id);
  const periods = readPeriods(team);
  const {
    periods: next,
    added,
    changed,
  } = syncSprints(periods, sprints, {
    boardId: team.jira?.boardId,
    naming: team.jira?.sprintNaming,
  });
  if (added.length || changed.length || !existsSync(periodsFile)) {
    mkdirSync(path.dirname(periodsFile), { recursive: true });
    writeFileSync(periodsFile, `${JSON.stringify(next, null, 2)}\n`);
  }
  const news = [
    added.length && `added ${added.join(", ")}`,
    changed.length && `updated plannedEnd of ${changed.join(", ")}`,
  ].filter(Boolean);
  return news.join("; ") || "no changes";
}

async function fromJira(teams) {
  loadDotEnv(root);
  const auth = jiraAuth(process.env);
  const notice = tokenExpiryNotice(process.env);
  if (notice) console.warn(s.yellow(`Warning: ${notice}`));
  const board = progressBoard(teams.map((t) => t.name));
  const failed = [];
  board.begin();
  await Promise.all(
    teams.map(async (team, i) => {
      if (team.jira?.boardId == null)
        return board.skipped(i, "no jira.boardId, skipped");
      board.start(i);
      try {
        board.update(i, "fetching sprints");
        const sprints = await fetchBoardSprints(
          jiraBase(team, process.env),
          team.jira.boardId,
          auth,
          { since: fetchSince(readPeriods(team)) },
        );
        board.done(i, syncTeam(team, sprints));
      } catch (err) {
        board.failed(i, err.message);
        failed.push(team.id);
      }
    }),
  );
  board.end();
  if (failed.length)
    throw new Error(
      `Sprint sync failed for: ${teams
        .filter((t) => failed.includes(t.id))
        .map((t) => t.id)
        .join(", ")}.`,
    );
}

async function main() {
  const argv = process.argv.slice(2);
  const id = teamArg(argv);
  const teams = readTeamsFile(root);
  if (!teams.length)
    throw new Error("config/teams.json has no teams. Add one first.");
  if (argv.includes("--from-jira")) return fromJira(selectTeams(teams, id));
  const file = argv.filter(
    (a, i) => a !== "--team" && argv[i - 1] !== "--team",
  )[0];
  if (!file) throw new Error(usage);
  if (!id && teams.length > 1) throw new Error(usage);
  const [team] = selectTeams(teams, id ?? teams[0].id);
  const raw = JSON.parse(readFileSync(file, "utf8"));
  console.log(
    `${team.name}: ${syncTeam(team, Array.isArray(raw) ? raw : raw.values)}`,
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
