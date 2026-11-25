#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TEAM_ID, teamPaths } from "../lib/team-config.mjs";

const root =
  process.env.TEAMSTATS_ROOT ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const at = (...p) => path.join(root, ...p);
const id = process.argv[2];

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!id || !TEAM_ID.test(id) || id === "github")
  fail(
    'Usage: node scripts/migrate-single-team.mjs <team-id>, where the id uses lowercase letters, digits and dashes and is not "github".',
  );
if (existsSync(at("config/teams.json")))
  fail("config/teams.json already exists, so there is nothing to migrate.");
if (!existsSync(at("config/team.json")))
  fail("config/team.json is missing, so there is nothing to migrate.");

const { team: name, ...rest } = JSON.parse(
  readFileSync(at("config/team.json"), "utf8"),
);
if (!name || !rest.githubOrg || !Array.isArray(rest.members))
  fail(
    'config/team.json needs "team", "githubOrg" and "members" before it can be migrated.',
  );
const p = teamPaths(root, id);
const moved = [];
const move = (from, to) => {
  if (!existsSync(from)) return;
  mkdirSync(path.dirname(to), { recursive: true });
  renameSync(from, to);
  moved.push(`${path.relative(root, from)} -> ${path.relative(root, to)}`);
};

move(at("config/periods.json"), p.periodsFile);
move(at("data/github"), p.dataDir);
writeFileSync(
  at("config/teams.json"),
  `${JSON.stringify([{ id, name, ...rest }], null, 2)}\n`,
);
move(at("config/team.json"), at("config/team.json.migrated"));
console.log(`Created config/teams.json with team "${id}".`);
moved.forEach((m) => console.log(`Moved ${m}`));
