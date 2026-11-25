---
name: refresh-team-stats
description: Refreshes the TeamStats reports for every configured team by running ./refresh.sh (Jira sprints, GitHub reviews, page build), falls back to the Atlassian MCP for sprints when the Jira token is missing or rejected, and reports the current standings. Use when asked to refresh, update, or pull the team stats, the review leaderboard, or new sprint data.
---

# Refresh team stats

Run from the folder that contains `AGENTS.md`. If `config/teams.json` is missing, use the setup-team-stats skill instead.

## 1. Run the refresh

Run `./refresh.sh`. It runs three steps, each even if an earlier one failed, and exits 1 naming the failed steps:

- **Sync sprints from Jira** needs `JIRA_EMAIL` and `JIRA_API_TOKEN` in `.env` (template: `env.example`). On a missing or rejected token (401), tell the user to create one at https://id.atlassian.com/manage-profile/security/api-tokens, then sync through the MCP (below) and rerun `node scripts/refresh-pr-reviews.mjs; node scripts/build-reports.mjs`.
- **Refresh PR reviews from GitHub**: if `gh` is not authenticated, ask the user to run `! gh auth login`. On a rate limit, give the reset time it printed and the teams it did not reach. Report other errors rather than retrying blindly.
- **Build reports** writes `reports/pr-reviews.html` and `reports/sprint-race.html`.

For a backfill (older periods or a new member), run `node scripts/refresh-pr-reviews.mjs --team <id> --since <ISO>` and then the build.

## MCP fallback for sprints

For each team with `jira.cloudId` and `jira.boardId`, call the Atlassian MCP `executeRead` with `name: "listJiraBoardSprints"` and `inputs: { boardId, state: "closed", maxResults: 1 }` to read `total`, then with `state: "closed"`, `startAt: max(0, total - 50)` and `maxResults: 50`, then with `state: "active"`. The MCP takes one state per call; do not use `"all"`, which includes future sprints. Pass `responseFields` `["values.id", "values.name", "values.startDate", "values.endDate", "values.originBoardId", "total", "isLast"]`. Write the `values` from the last two calls, combined into one array, to a file in your scratch directory and run `node scripts/sync-periods.mjs --team <id> <that file>`. Never edit existing periods by hand. If the MCP is unavailable too, say so; GitHub data still refreshes into the existing periods.

## 2. Report

Give each team's standings from the refresh output, any sprints the sync added, and the two report paths, in a few lines per team. If a team's latest sprint `plannedEnd` has passed with no newer sprint, say its results are provisional until the sprint is closed in Jira and the refresh runs again.
