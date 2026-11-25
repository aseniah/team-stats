export class JiraAuthMissing extends Error {}

export function jiraAuth(env) {
  const { JIRA_EMAIL: email, JIRA_API_TOKEN: token } = env;
  if (!email || !token)
    throw new JiraAuthMissing(
      "Set JIRA_EMAIL and JIRA_API_TOKEN in .env (see env.example) to fetch sprints from Jira.",
    );
  return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
}

export function jiraBase(team, env) {
  const site = env.JIRA_SITE?.trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  if (site)
    return `https://${site.includes(".") ? site : `${site}.atlassian.net`}`;
  if (!team.jira?.cloudId)
    throw new Error(
      `${team.id} has no jira.cloudId; set JIRA_SITE in .env instead.`,
    );
  return `https://api.atlassian.com/ex/jira/${team.jira.cloudId}`;
}

export const TOKENS_PAGE =
  "https://id.atlassian.com/manage-profile/security/api-tokens";
const WARN_DAYS = 14;

export function tokenExpiryNotice(env, now = new Date()) {
  const raw = env.JIRA_TOKEN_EXPIRES?.trim();
  if (!raw) return null;
  const t = Date.parse(raw);
  if (Number.isNaN(t))
    return `JIRA_TOKEN_EXPIRES is not a date (got "${raw}"); use YYYY-MM-DD.`;
  const days = Math.ceil((t - now.getTime()) / 864e5);
  if (days <= 0)
    return `The Jira token expired on ${raw}. Create a new one at ${TOKENS_PAGE}, then update JIRA_API_TOKEN and JIRA_TOKEN_EXPIRES in .env.`;
  if (days <= WARN_DAYS)
    return `The Jira token expires on ${raw} (in ${days} day${days === 1 ? "" : "s"}). Create a new one at ${TOKENS_PAGE}, then update JIRA_API_TOKEN and JIRA_TOKEN_EXPIRES in .env.`;
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, auth, { fetch, wait, tries = 4 }) {
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        headers: { Authorization: auth, Accept: "application/json" },
      });
    } catch (err) {
      if (attempt >= tries)
        throw new Error(
          `Jira request to ${new URL(url).host} failed: ${err.cause?.code ?? err.cause?.message ?? err.message}`,
        );
      await wait(2000 * attempt);
      continue;
    }
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status >= 500) && attempt < tries) {
      const after = Number(res.headers.get("retry-after"));
      await wait(
        Number.isFinite(after) && after > 0 ? after * 1000 : 2000 * attempt,
      );
      continue;
    }
    const hint =
      res.status === 401
        ? ` Jira rejected the token; it may have expired. Create a new one at ${TOKENS_PAGE} and update JIRA_API_TOKEN in .env, or check JIRA_EMAIL.`
        : res.status === 403 || res.status === 404
          ? " Check the token can read this board, or set JIRA_SITE if the token is a classic (unscoped) one."
          : "";
    throw new Error(
      `Jira returned ${res.status} for ${new URL(url).pathname}.${hint}`,
    );
  }
}

const PAGE = 50;
const pick = ({ id, name, state, startDate, endDate, originBoardId }) => ({
  id,
  name,
  state,
  startDate,
  endDate,
  originBoardId,
});

// Jira lists sprints oldest first, so read the total and walk pages back from the end until a page
// reaches a sprint from this board that started on or before `since`.
export async function fetchBoardSprints(
  base,
  boardId,
  auth,
  { since, fetch = globalThis.fetch, wait = sleep } = {},
) {
  const url = (startAt, max) =>
    `${base}/rest/agile/1.0/board/${boardId}/sprint?state=active,closed&startAt=${startAt}&maxResults=${max}`;
  const { total = 0 } = await getJson(url(0, 1), auth, { fetch, wait });
  const stop = since ? Date.parse(since) : -Infinity;
  const pages = [];
  for (let end = total; end > 0; ) {
    const startAt = Math.max(0, end - PAGE);
    const values =
      (await getJson(url(startAt, end - startAt), auth, { fetch, wait }))
        .values ?? [];
    if (!values.length) break;
    pages.unshift(values.map(pick));
    end = startAt;
    if (
      values.some(
        (v) =>
          v.originBoardId === boardId &&
          v.startDate &&
          Date.parse(v.startDate) <= stop,
      )
    )
      break;
  }
  return pages.flat();
}
