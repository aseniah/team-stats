# TeamStats

Manager tools and reports for one or more engineering teams, viewed as local HTML files. Everything specific to a team or company lives in `config/` and `data/`; code, templates, tests and docs stay generic.

## Layout

- `config/teams.json`: an array of teams in switcher order; the first is the default. Each has `id`, `name`, `githubOrg`, `jira` (cloud id, board id, project key and sprint naming rule) and members with membership windows. `config/teams.example.json` shows the shape.
- `config/periods/<team-id>.json`: one team's reporting periods (Jira sprints today), oldest first. `config/periods.example.json` shows the shape.
- `data/<team-id>/<source>/<dataset>/`: one team's raw data partitioned by UTC month of event time. `data/<team-id>/github/pr-review-events/YYYY-MM.jsonl` holds one row per submitted review, and `data/<team-id>/github/state.json` records that team's last refresh and how far back its data goes (`coveredFrom`). Data stays per team because a refresh replaces every row in its window.
- `lib/`: shared modules. `lib/review-stats.mjs` (counting and the finished-sprint rule), `lib/race-engine.mjs` (race clock, speed, places and narration events) and `lib/page-utils.mjs` (storage, escaping, names, the URL hash, and the top bar with nav, team switcher and color mode) are inlined into pages, so they must stay import-free and use only `export function` and `export const`. `lib/periods.mjs` turns Jira sprints into periods. `lib/refresh-window.mjs` decides where a team's refresh starts. `lib/demo-teams.mjs` generates the published demo's invented teams. `lib/team-config.mjs` reads `config/teams.json`, gives each team's file paths and loads `.env`. `lib/jira.mjs` lists a board's sprints through the Jira REST API. `lib/progress.mjs` draws the refresh's per-team status lines, and `lib/style.mjs` colors script output on a terminal (`NO_COLOR` turns it off, `FORCE_COLOR` on).
- `scripts/`: `sync-periods.mjs` (Jira sprint list to a team's periods file), `refresh-pr-reviews.mjs` (GitHub to `data/`), `build-reports.mjs` (config and data to `reports/`, or invented teams to `docs/demo/` and `test/output/`) and `migrate-single-team.mjs` (moves the old single-team layout into `config/teams.json`).
- `reports/src/`: page templates and page scripts. `shared.css` holds the color tokens, the ten person colors, the display font, the page width, the top bar, the page header and the shared controls, and is inlined into every page. `race-themes/` holds one file per race look. `reports/*.html` is generated; never edit it by hand.
- `docs/`: the README screenshots and `docs/demo/`, the published demo pages (served by GitHub Pages from `/docs`), built from `lib/demo-teams.mjs`.
- `test/fixtures/scenario-teams.mjs`: two invented teams that exercise every leaderboard and race edge case (ties, a late joiner, a zero, a live sprint), built into the gitignored `test/output/` for manual checks.
- `.claude/skills/setup-team-stats/`: the agent skill that reviews the setup, fixes gaps, and adds a team by interviewing the user, looking up ids, discovering members and settling how their names show on charts.
- `.claude/skills/refresh-team-stats/`: the agent skill that adds new sprints from Jira and refreshes every team.

## Keeping it generic

Never put a team name, company name, person, login, org, board id or sprint naming convention in code, templates, tests, `AGENTS.md` or the skill. If behavior needs to differ between teams, add a field to the team in `config/teams.json` with a sensible default, and document it here. Test fixtures use invented names (`acme`, `ada-gh`).

## Commands

Running the reports requires Node 26+ and an authenticated `gh` CLI, with no npm install. Development tooling (Biome) installs with `npm install`; the repo's `.npmrc` keeps installs on the public npm registry.

- Set up: run the setup-team-stats skill, or copy `config/teams.example.json` to `config/teams.json`, edit it and run `./refresh.sh`, which seeds each new team's last 12 months of sprints from Jira.
- Refresh everything without an agent: `./refresh.sh` runs the three scripts in order: it syncs every team's sprints from the Jira API, refreshes GitHub and builds, opens the leaderboard when the build succeeds (`--no-open` skips it), and exits non-zero if any step failed. Each step runs even if an earlier one failed. It needs `JIRA_EMAIL` and `JIRA_API_TOKEN` in `.env` (copy `env.example`); `JIRA_SITE` is needed for a classic token, and `JIRA_TOKEN_EXPIRES` (YYYY-MM-DD) makes the sync warn 14 days before the token expires, and `GH_TOKEN` is optional. Scripts load `.env` themselves.
- Sync sprints from Jira directly: `node scripts/sync-periods.mjs --from-jira [--team <id>]`, using the same `.env` It fetches every team's sprints at once with a status line per team, like the GitHub refresh; a team that fails is reported and the others still sync.
- Sync sprints from a file: `node scripts/sync-periods.mjs --team <id> <sprints.json>`, where the file holds Jira sprints (an array, or a Jira response with `values`) with `id`, `name`, `startDate`, `endDate` and `originBoardId`. `--team` may be left out when only one team is configured. With an empty or missing periods file it adds every sprint in the file, which is how a new team is seeded.
- Refresh and rebuild: `node scripts/refresh-pr-reviews.mjs; node scripts/build-reports.mjs`. The `;` keeps the build running after a refresh that failed for some teams, so the refreshed teams still show. The refresh runs up to `PARALLEL_TEAMS` teams at once (set at the top of the script, default 2), shows a status line per team and prints every team's results at the end; `--team <id>` refreshes one. The build always includes every team and writes `reports/pr-reviews.html` and `reports/sprint-race.html`. `--demo` (`npm run demo`) writes the same pages for the demo teams to `docs/demo/` instead, and `--scenarios` writes the edge-case teams to `test/output/`; neither reads `config/`.
- Backfill from a date: `node scripts/refresh-pr-reviews.mjs --team <id> --since 2026-01-01T00:00:00Z`
- Migrate the old single-team layout: `node scripts/migrate-single-team.mjs <team-id>`. Scripts exit with this hint when they find `config/team.json` and no `config/teams.json`.
- Check: `npm run check` runs Biome, shellcheck on the `.sh` scripts (`brew install shellcheck`) and `npm test` (`node --test test/`). `npm run fix` applies Biome's formatting and safe fixes. `.github/workflows/check.yml` runs it on every push to `main` and every pull request, on Node 26.
- View: `./open.sh` opens `reports/pr-reviews.html` in the default browser, and `./open.sh race` opens `reports/sprint-race.html`. The Claude in Chrome extension cannot open `file://` URLs, so for automated checks serve the folder with `python3 -m http.server 8765 --bind 127.0.0.1 --directory reports`.

The default refresh window starts at the second most recent period's start, or earlier if that team's last refresh (`data/<team-id>/github/state.json`) ended in an older period, so the current and previous sprint are always re-fetched and a gap between refreshes is never skipped. A team's first refresh, and any refresh after periods were added before its `coveredFrom`, starts at the earliest period instead, so every seeded sprint has reviews. A `state.json` without `coveredFrom` counts as covering every period. A refresh replaces every row in its window and keeps older rows, so reruns are safe.

A refresh that fails for one team is reported and the other teams still run, except when GitHub's primary rate limit resets more than 15 minutes out: then no further team starts, and the summary names the teams it did not reach. The refresh exits non-zero whenever any team failed.

The refresh runs a team's member searches in parallel and fetches PRs 50 per GraphQL call. Every `gh` call retries on GitHub rate limits and transient errors: a primary limit waits for its reset when that is under 15 minutes and otherwise exits with the reset time, a secondary limit waits a minute and doubles, and 5xx or network errors back off from 2 seconds. Other errors, such as bad credentials, fail at once.

## Counting rules for PR reviews

- A review event is a submitted review (`APPROVED`, `CHANGES_REQUESTED`, `COMMENTED`, or later `DISMISSED`) by a team member on a PR in the configured `githubOrg` that the member did not author. Conversation-tab comments are not fetched and never count.
- Every review counts, including repeat reviews on the same PR. The leaderboard ranks by review count; distinct PRs reviewed show as the secondary number.
- GitHub also records a standalone inline comment ("Add single comment") and a reply in a code thread as a `COMMENTED` review. A `COMMENTED` review with an empty body and at most one inline comment is stored with `excluded: "inline-comment"` and not counted. A real Comment review with no summary and exactly one inline comment looks the same and is missed.
- Events after the PR merged are stored with `excluded: "after-merge"` and not counted. PRs closed without merging count with no cutoff.
- A member's PR count for a period is the number of distinct PRs with at least one counted review in that period. Range totals add per-period counts.
- A review counts in the period containing its own timestamp, not the period in which the PR merged or closed.
- A period runs from its `start` to the next period's `start`. The latest period runs to now and shows as in progress.
- GitHub's `reviewed-by:` search also matches PRs where the person was only requested as a reviewer through a team, so search results are a candidate list. The counts come from the fetched reviews.

## Membership

Members belong to one team's entry in `config/teams.json`. Someone on two teams is listed in both and fetched once per team. Members have `from` and `to` dates (`to: null` means current). Events count only inside `[from, to)`. To remove someone, set `to`; never delete the entry, or their history disappears from past periods. To add someone, append an entry with their GitHub login and a `from` date. `displayName` is optional and replaces the first name on charts. Someone who leaves and later rejoins gets a second entry with a new `id`, the same `github` login and a `from` after the first entry's `to`; each review counts toward the entry whose window contains it.

## Last place

`lastPlaceEmoji` on a team in `config/teams.json` sets the mark for last place on both pages: the leaderboard's podium note and table, and the race's ceremony, tags and results. It is off when missing, `""` or `null`: last place is then shown like any other place, with no callout. Set an emoji such as 💩 to turn it on for that team. Last place is marked only when it is below 3rd.

## Periods

Each period is `{ id, kind, name, label, start, plannedEnd, jiraSprintId }`. `start` is the Jira sprint `startDate`; `plannedEnd` is its `endDate` and is used only for display. `label` is the short form shown in table headers and chart ticks; pages fall back to `name` when it is missing. Ids appear in URLs and saved page settings, so never change an existing id.

`jira.sprintNaming` on a team controls its new periods:

- `namePattern`: a regular expression with named groups, matched against the Jira sprint name. For `Sprint 42 Otters`, `^Sprint (?<number>\d+)` captures `number`.
- `id` and `label`: templates that use the named groups plus `{jiraId}` and `{name}`. For example `sprint-{number}` and `{number}`.
- When the pattern does not match or a template slot is empty, the id is `sprint-<jiraId>` and the label is the full name. Without `sprintNaming`, every sprint gets those defaults.

When the team moves to Kanban, append periods of another `kind` (for example `week`) with their own starts; raw events carry only timestamps, so history rebuckets with no migration.

## Sprint race

`reports/sprint-race.html` replays one sprint's counted reviews as an animated race, for a retro screen share. A full sprint takes about a minute. A sprint still in progress plays at the same speed per day, sized to its planned end, so it finishes sooner. It uses the same counting code as the leaderboard, so final distances equal leaderboard review counts. Open a sprint with `sprint-race.html#<team id>/<period id>`; with only a team it opens that team's latest finished sprint, and with no hash it opens the last team viewed (or the first team). `pr-reviews.html#<team id>/<period id>` works the same way. An old `#<period id>` link resolves against the last team viewed, and a period the selected team does not have falls back to that team's default.

- A sprint is final when the next period exists. It is provisional when its `plannedEnd` has passed but the next sprint is not configured yet: medals show with a note that results may change. Otherwise it is live: the clock stops at the last refresh and the race ends on standings, without medals.
- Retro flow: close the sprint in Jira, run the refresh (which adds the next sprint and pulls the final reviews), then open the race.
- To add a look, copy `reports/src/race-themes/cars.js` to a new file, give it a new `id` and `label`, and change its drawing, words, phrases and palette. The build includes every file in that folder and the Look select lists them. `test/race-themes.test.mjs` checks each theme's shape.

## Teams and the top bar

Team ids match `^[a-z0-9-]+$`, appear in URLs, saved page settings and data paths, and never change. Every page renders the top bar from `lib/page-utils.mjs`: the brand, one nav link per report, the team switcher (a plain team name when only one team is configured) and the color mode toggle. Nav links carry only `#<team>`, so each report opens on its own default sprint, and the selected team, color mode, race look and leaderboard range are saved under one storage key shared by every page. Sprint selection stays on each page.

## Adding a tool

Put its raw data under `data/<team-id>/<source>/<dataset>/` with month-partitioned JSONL, its page template under `reports/src/<tool>.html` with a `<header class="topbar" id="topbar">` and `mountTopBar`, a `build<Tool>()` in `scripts/build-reports.mjs` that writes `reports/<tool>.html`, and an entry in `REPORTS` there so every page's nav links to it. Reuse `config/teams.json` and the per-team periods rather than adding parallel config.

## Demo and screenshots

The repo is public, so the demo and screenshots use invented teams only, never real people, orgs or screenshots of real data. `docs/demo/` holds the happy path: every sprint, the live one included, has a clear podium and a single last place, except Platform's sprint 43, which shows the one two way tie (for 2nd). `test/demo-teams.test.mjs` checks this across four weeks of build dates. Edge cases belong in `test/fixtures/scenario-teams.mjs`, not the demo. A change to how a page looks rebuilds the demo with `npm run demo` in the same change, and retakes `docs/leaderboard.png` (Platform's latest finished sprint, header to the sprint chart) and `docs/sprint-race.png` (the same sprint, mid-race) when what they show changed.

## Verifying a change

1. `npm run check` passes. Run `npm run fix` first.
2. New logic in `lib/` gets unit tests in `test/`, with invented data. Code that runs on import, like the `scripts/` entry points, keeps its logic in `lib/` so tests can reach it.
3. A page change is checked in a browser against the scenario pages (`node scripts/build-reports.mjs --scenarios`, then `test/output/`) in light and dark mode.
4. A change someone running TeamStats would notice bumps `version` in `package.json` and adds an entry at the top of `CHANGELOG.md` with the same version, under `### Features` or `### Fixes`, leaving out a heading with nothing under it. Docs, demo and test changes stay out of the changelog. `test/changelog.test.mjs` checks the versions match.
