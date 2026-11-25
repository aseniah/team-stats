import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { readEvents } from "./event-store.mjs";

export const TEAM_ID = /^[a-z0-9-]+$/;

export class LegacyLayoutError extends Error {}

export function teamPaths(root, id) {
  const dataDir = path.join(root, "data", id, "github");
  return {
    periodsFile: path.join(root, "config", "periods", `${id}.json`),
    dataDir,
    eventsDir: path.join(dataDir, "pr-review-events"),
    stateFile: path.join(dataDir, "state.json"),
  };
}

export function readTeamsFile(root) {
  const file = path.join(root, "config", "teams.json");
  if (!existsSync(file)) {
    if (existsSync(path.join(root, "config", "team.json"))) {
      throw new LegacyLayoutError(
        "Found config/team.json from the single-team layout but no config/teams.json. Run `node scripts/migrate-single-team.mjs <team-id>` to move it, its periods and its data into the multi-team layout.",
      );
    }
    throw new Error(
      "config/teams.json is missing. Copy config/teams.example.json to config/teams.json and edit it, or ask your agent to add a team.",
    );
  }
  const teams = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(teams))
    throw new Error("config/teams.json must hold an array of teams.");
  const seen = new Set();
  for (const [i, t] of teams.entries()) {
    const where = `config/teams.json team ${i + 1}`;
    if (typeof t.id !== "string" || !TEAM_ID.test(t.id))
      throw new Error(
        `${where} needs an id of lowercase letters, digits and dashes (got ${JSON.stringify(t.id)}).`,
      );
    if (seen.has(t.id)) throw new Error(`${where} repeats the id "${t.id}".`);
    seen.add(t.id);
    for (const k of ["name", "githubOrg"])
      if (!t[k]) throw new Error(`${where} ("${t.id}") is missing "${k}".`);
    if (!Array.isArray(t.members))
      throw new Error(`${where} ("${t.id}") needs a "members" array.`);
  }
  return teams;
}

const readJsonOr = (file, fallback) =>
  existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback;

export function loadTeam(root, team) {
  const p = teamPaths(root, team.id);
  return {
    ...team,
    periods: readJsonOr(p.periodsFile, []),
    events: readEvents(p.eventsDir),
    refreshedAt: readJsonOr(p.stateFile, {}).refreshedAt ?? null,
  };
}

export function selectTeams(teams, id) {
  if (!id) return teams;
  const t = teams.find((x) => x.id === id);
  if (!t)
    throw new Error(
      `No team "${id}" in config/teams.json. Teams: ${teams.map((x) => x.id).join(", ") || "none"}.`,
    );
  return [t];
}

export function teamArg(argv) {
  const i = argv.indexOf("--team");
  if (i < 0) return null;
  const v = argv[i + 1];
  if (!v || v.startsWith("--")) throw new Error("--team needs a team id.");
  return v;
}

export function loadDotEnv(root) {
  const file = path.join(root, ".env");
  if (existsSync(file)) process.loadEnvFile(file);
}
