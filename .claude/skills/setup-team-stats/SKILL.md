---
name: setup-team-stats
description: Sets up TeamStats or checks an existing setup. Reviews the tools, the Jira token and every configured team, fixes what is missing one question at a time, and adds a new team by looking up its Jira board, sprints and GitHub logins, quizzing the user on members and how their names show on charts, then backfilling reviews. Use when asked to set up TeamStats, add or configure a team, check the setup, or fix member names or sprint labels.
---

# Set up TeamStats

Run from the folder that contains `AGENTS.md`, and read it first if you have not this session; it defines `config/teams.json`, the periods files, the counting rules and the commands used below.

Ask one question at a time. Look ids up yourself (board id, cloud id, sprint id, GitHub login) and ask the user to confirm what you found. Every step is safe to rerun: read what is configured, keep what the user already confirmed, and ask only about gaps.

## 1. Review the current state

Check each item and keep a list of gaps:

- **Tools.** `node --version` is 26 or later (`brew install node`). `gh auth status` succeeds (`brew install gh`, then ask the user to run `! gh auth login`).
- **Jira access.** `.env` has `JIRA_EMAIL`, `JIRA_API_TOKEN` and `JIRA_SITE` set. Check presence only and never print the values. Without them, `./refresh.sh` cannot add new sprints: send the user to `README.md` step 2. The Atlassian MCP (`getAccessibleAtlassianResources` returns a site) lets this skill look things up either way; if both are missing, stop and say which to set up.
- **Old layout.** If `config/team.json` exists and `config/teams.json` does not, ask for a team id and run `node scripts/migrate-single-team.mjs <id>`.
- **Each team in `config/teams.json`:**
  - `config/periods/<id>.json` exists and has sprints.
  - `jira.boardId` is set.
  - `jira.sprintNaming` is set, or the user chose to leave it out. If the latest period's `label` equals its full `name`, it is probably unset: offer step 5.
  - Member names, checked as in step 6. Flag two members whose chart labels match, and members with no `displayName` whose GitHub profile name differs from `name`.
  - `data/<id>/github/state.json` exists. Without it the team has never been refreshed.

Show the gaps as a short checklist, one line per team, and offer to fix them in order. With no teams configured, go to step 2.

## 2. Name the team

Ask for the team's name. Propose an id from it (lowercase letters, digits and dashes, for example `platform` for "Platform"), check it is not already in `config/teams.json`, and confirm it. Team ids never change once written.

## 3. Find the Jira board and GitHub org

1. Call `executeRead` with `name: "listJiraBoards"` and `inputs: { name: <a distinctive word from the team name> }`, with `responseFields` `["values.id", "values.name", "values.type", "values.location.projectKey", "isLast"]`. Try each distinctive word and any project key the user offers.
2. Confirm one board with the user by name and project, or list the candidates and ask. If none fit, ask for the key of any ticket in the team's current sprint, read it with `getJiraIssue`, and take the `boardId` from its sprint field (usually `customfield_10020`).
3. If other teams are configured, propose their `githubOrg`. Otherwise list the user's orgs with `gh api user/orgs --jq '.[].login'` and ask which one holds the team's repositories.

## 4. Choose how many sprints to seed

Call `listJiraBoardSprints` with `boardId` and `state: "active"`, then with `state: "closed"` and `maxResults: 1` to read `total`. Closed sprints come oldest first, 50 at a time, so fetch from `startAt: max(0, total - 50)`, and the page before it if needed to cover 12 months. Use `responseFields` `["values.id", "values.name", "values.startDate", "values.endDate", "values.originBoardId", "values.state", "total", "isLast"]`. Keep sprints whose `originBoardId` is this board and that have a `startDate`.

Ask how many previous sprints to seed, recommending 6. The active sprint is added on top. Seed at most the closed sprints that started within the last 12 months, and if the user asks for more, say that older history makes the first GitHub fetch much longer. Every seeded sprint gets its reviews on the first refresh.

## 5. Suggest the sprint naming

From the recent sprint names, propose `jira.sprintNaming`: a `namePattern` with named groups, plus `id` and `label` templates (see "Periods" in `AGENTS.md`). Preview it on the real names:

```bash
node --input-type=module -e "import { periodFromSprint } from './lib/periods.mjs'; const naming = <naming JSON>; for (const s of <sprints JSON>) { const p = periodFromSprint(s, naming); console.log(s.name, '->', p.id, '|', p.label); }"
```

Show the user each sprint's name, id and label as a suggestion, and offer to change the label (for example `{number}` or the full name) or to leave naming out, which keeps full names as labels. For a team that already has periods, say that existing periods keep their ids and labels, since ids never change; only sprints added from now on use the new rule.

## 6. Discover the members, then quiz the user

Treat what you discover as a draft. It will contain people who are not on the team (product managers, managers, designers, people from other teams who picked up a ticket) and can miss people.

1. Search Jira with `searchJiraIssuesUsingJql`: `sprint in (<ids of the seeded sprints and the active sprint>)`, fields `["assignee"]`, paging with `nextPageToken` until `isLast`. Count issues per assignee.
2. Find GitHub logins:
   - List the org's GitHub teams with `gh api --paginate 'orgs/<org>/teams?per_page=100' --jq '.[] | "\(.slug)\t\(.name)"'` and pick any whose name resembles the team name. List their members with `gh api --paginate 'orgs/<org>/teams/<slug>/members?per_page=100' --jq '.[].login'` and read each profile name with `gh api users/<login> --jq .name`.
   - Match assignees to logins by name, allowing for short forms (for example Robert and Bob).
   - For an assignee with no match, search `gh api 'search/users?q=<full name> in:name' --jq '.items[].login'` and keep only org members (`gh api orgs/<org>/members/<login>` succeeds).
3. Show one table: each assignee with ticket count and proposed login (or "no login found"), most tickets first, then GitHub team members who had no tickets. Ask the user to confirm who is on the team, remove anyone who is not, add anyone missing, and correct any login.

Then settle names, because the user knows what the team calls each person and you do not:

- `name` is the person's full name as Jira shows it. It stays as is.
- Charts show `displayName` when it is set, and otherwise the first word of `name`. A preferred name or nickname goes in `displayName`.
- Show each confirmed member as `full name → shows on charts as`, with the Jira name and the GitHub profile name side by side when they differ. Ask the user to correct any chart name that is not what the team calls that person, and set `displayName` only from their answer.
- Two members whose chart names match need a `displayName` each so the charts tell them apart. Ask the user what to use.

Write only members the user confirmed, each with `from` set to the first seeded sprint's start date and `to: null`.

## 7. Write the config and refresh

1. Ask whether the team wants last place called out with an emoji (for example 💩). It is off unless set; add `"lastPlaceEmoji": "<emoji>"` only if they want it.
2. Append the team to `config/teams.json` (create it as an array if missing):

   ```json
   {
     "id": "<team id>",
     "name": "<team name>",
     "githubOrg": "<org>",
     "jira": { "cloudId": "<cloud id>", "boardId": 0, "projectKey": "<key>", "sprintNaming": {} },
     "members": [{ "id": "<first name, lowercase, unique in the team>", "name": "<full name>", "github": "<login>", "from": "<YYYY-MM-DD>", "to": null }]
   }
   ```

3. Write the seeded sprints (the chosen closed ones plus the active one, as Jira returned them) as a JSON array to a file in your scratch directory and run `node scripts/sync-periods.mjs --team <id> <that file>`.
4. Run `node scripts/refresh-pr-reviews.mjs --team <id>; node scripts/build-reports.mjs`. The first refresh fetches reviews for every seeded sprint and can take several minutes.

For a fix to an existing team, edit only the fields the user changed, then run `node scripts/build-reports.mjs`. Adding older sprints to a team is picked up by its next refresh, which backfills them.

The work is done when every gap from step 1 is fixed or the user chose to leave it. Report each team's state in a line or two, the closing standings of any team you refreshed, and that `./open.sh` opens the leaderboard.
