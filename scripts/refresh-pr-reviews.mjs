#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readEvents, writeWindow } from "../lib/event-store.mjs";
import {
  execGh,
  fetchPrs,
  mapLimit,
  RateLimitExhausted,
  searchPrs,
  toEvents,
  withRetry,
} from "../lib/github.mjs";
import { progressBoard } from "../lib/progress.mjs";
import { refreshWindow } from "../lib/refresh-window.mjs";
import {
  countByPeriod,
  effectivePeriods,
  memberWindow,
} from "../lib/review-stats.mjs";
import { styler } from "../lib/style.mjs";
import {
  loadDotEnv,
  readTeamsFile,
  selectTeams,
  teamArg,
  teamPaths,
} from "../lib/team-config.mjs";

const PARALLEL_TEAMS = 2;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadDotEnv(root);
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const s = styler(process.stdout);
const shortTime = (iso) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

function sinceArg(argv) {
  const i = argv.indexOf("--since");
  if (i < 0) return null;
  const t = Date.parse(argv[i + 1]);
  if (Number.isNaN(t))
    throw new Error(
      `--since needs an ISO date or time, for example --since 2026-01-01T00:00:00Z (got ${argv[i + 1] ?? "nothing"})`,
    );
  return new Date(t).toISOString();
}

function readState(stateFile) {
  try {
    return readJson(stateFile);
  } catch {
    return null;
  }
}

async function refreshTeam(team, sinceOverride, progress) {
  const { periodsFile, eventsDir, stateFile } = teamPaths(root, team.id);
  const periods = existsSync(periodsFile) ? readJson(periodsFile) : [];
  const now = new Date();
  const eff = effectivePeriods(periods, now);
  if (!eff.length)
    throw new Error(
      `${path.relative(root, periodsFile)} has no periods. Add at least one sprint (see config/periods.example.json) before refreshing.`,
    );
  const { since, coveredFrom } = refreshWindow(
    eff,
    readState(stateFile),
    sinceOverride,
  );

  const sinceMs = Date.parse(since);
  const active = team.members.filter((m) => {
    const w = memberWindow(m);
    return w.from < now.getTime() && sinceMs < w.to;
  });
  const logins = new Set(active.map((m) => m.github));
  const notes = [];
  let status = "";
  const show = (text) => progress((status = text));
  const run = withRetry(execGh, {
    log: (msg) => {
      notes.push(msg.trim());
      progress(`${status} (${msg.trim()})`);
    },
  });

  show(`searching reviews by ${logins.size} members`);
  const ids = new Set();
  const qualifiers = [...logins].map((login) => `reviewed-by:${login}`);
  const found = await Promise.all(
    qualifiers.map((q) => searchPrs(team.githubOrg, q, since, null, run)),
  );
  found.forEach((list) => list.forEach((id) => ids.add(id)));

  let done = 0;
  show(`fetching PRs 0/${ids.size}`);
  const prs = await fetchPrs([...ids], run, {
    onBatch: (n) => show(`fetching PRs ${(done += n)}/${ids.size}`),
  });

  const fresh = prs.flatMap((pr) => toEvents(pr, logins, since));
  const written = writeWindow(eventsDir, fresh, since, now);
  mkdirSync(path.dirname(stateFile), { recursive: true });
  writeFileSync(
    stateFile,
    `${JSON.stringify({ refreshedAt: now.toISOString(), since, coveredFrom }, null, 2)}\n`,
  );
  const months = written.map((p) => path.basename(p, ".jsonl")).join(", ");

  const latest = eff.at(-1);
  const counts = countByPeriod(readEvents(eventsDir), team.members, eff)[
    latest.id
  ];
  const ranked = team.members
    .filter((m) => counts[m.id])
    .sort((a, b) => counts[b.id].reviews - counts[a.id].reviews);
  const label = (m) => m.displayName ?? m.name;
  const width = Math.max(0, ...ranked.map((m) => label(m).length));
  return {
    status: `${ids.size} PRs, ${fresh.length} events`,
    lines: [
      `${s.bold(team.name)}  ${latest.name}${latest.inProgress ? s.dim(" (in progress)") : ""}`,
      ...ranked.map(
        (m, i) =>
          `  ${s.dim(`${i + 1}.`.padStart(3))} ${label(m).padEnd(width)}  ${s.bold(String(counts[m.id].reviews).padStart(3))} reviews  ${String(counts[m.id].count).padStart(3)} PRs`,
      ),
      s.dim(
        `  Fetched ${ids.size} PRs and ${fresh.length} events since ${shortTime(since)}`,
      ),
      s.dim(`  Updated months ${months || "none"}`),
      ...notes.map((n) => s.yellow(`  ${n}`)),
    ],
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const since = sinceArg(argv);
  const teams = selectTeams(readTeamsFile(root), teamArg(argv));
  const board = progressBoard(teams.map((t) => t.name));
  let exhausted = false;
  board.begin();
  const results = await mapLimit(teams, PARALLEL_TEAMS, async (team, i) => {
    if (exhausted) {
      board.skipped(i, "not refreshed because of the rate limit");
      return { skipped: true };
    }
    board.start(i);
    try {
      const result = await refreshTeam(team, since, (text) =>
        board.update(i, text),
      );
      board.done(i, result.status);
      return result;
    } catch (err) {
      if (err instanceof RateLimitExhausted) exhausted = true;
      board.failed(i, err.message);
      return { error: err };
    }
  });
  board.end();

  const failed = teams.filter((_t, i) => results[i].error).map((t) => t.id);
  const skipped = teams.filter((_t, i) => results[i].skipped).map((t) => t.id);
  const summary = results.flatMap((r, i) => [
    ...(r.lines ?? [
      s.bold(teams[i].name),
      r.error
        ? s.red(`  Failed: ${r.error.message}`)
        : s.yellow("  Not refreshed because of the rate limit"),
    ]),
    "",
  ]);
  console.log(`\n${summary.join("\n").trimEnd()}`);
  if (failed.length || skipped.length) {
    console.error(
      s.red(
        `\nFailed: ${failed.join(", ") || "none"}.${skipped.length ? ` Not refreshed because of the rate limit: ${skipped.join(", ")}.` : ""}`,
      ),
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
