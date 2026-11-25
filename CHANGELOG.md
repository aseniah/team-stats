# Changelog

## 1.1.0

### Features

- **Refresh app for macOS.** `macos/build-app.sh` puts a Refresh TeamStats app on your Desktop that runs the refresh with a progress window showing each step and team, then opens the leaderboard. No Terminal window.

## 1.0.0

First public release.

### Features

- **PR review leaderboard.** A podium for each sprint, a day by day chart of cumulative reviews, the PRs each person reviewed, and charts and a table across past sprints.
- **Sprint race.** Replays a sprint's reviews as a one minute animated race for a retro screen share, in three looks: cars, horses and sleds.
- **Several teams.** A team switcher in the top bar, with each team's members, GitHub org and Jira board kept in one config file.
- **Optional last place callout.** Set an emoji such as 💩 on a team to mark whoever reviewed the least.
- **Light and dark mode.** Follows your system setting, or pick one with the toggle.
- **One command refresh.** `./refresh.sh` adds new sprints from Jira, pulls reviews from GitHub, rebuilds the pages and opens the leaderboard. A new team's first refresh pulls reviews for every sprint it adds. `./open.sh` opens the pages any time.
- **Agent setup.** Claude Code skills that check your setup, add a team by interviewing you, and run the refresh.
