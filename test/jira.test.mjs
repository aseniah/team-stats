import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fetchBoardSprints,
  JiraAuthMissing,
  jiraAuth,
  jiraBase,
  tokenExpiryNotice,
} from "../lib/jira.mjs";

const res = (status, body, headers = {}) => ({
  ok: status < 300,
  status,
  json: async () => body,
  headers: { get: (k) => headers[k] ?? null },
});
const team = { id: "acme", jira: { cloudId: "cloud-1", boardId: 7 } };

test("jiraAuth builds basic auth and names the missing vars", () => {
  assert.equal(
    jiraAuth({ JIRA_EMAIL: "a@b.c", JIRA_API_TOKEN: "t" }),
    `Basic ${Buffer.from("a@b.c:t").toString("base64")}`,
  );
  assert.throws(
    () => jiraAuth({ JIRA_EMAIL: "a@b.c" }),
    (e) => e instanceof JiraAuthMissing && /JIRA_API_TOKEN/.test(e.message),
  );
});

test("jiraBase prefers JIRA_SITE and falls back to the cloud id gateway", () => {
  assert.equal(
    jiraBase(team, { JIRA_SITE: "https://acme.atlassian.net/" }),
    "https://acme.atlassian.net",
  );
  assert.equal(
    jiraBase(team, { JIRA_SITE: "acme" }),
    "https://acme.atlassian.net",
  );
  assert.equal(jiraBase(team, {}), "https://api.atlassian.com/ex/jira/cloud-1");
  assert.throws(() => jiraBase({ id: "x", jira: {} }, {}), /JIRA_SITE/);
});

const board = (n) =>
  Array.from({ length: n }, (_, k) => ({
    id: k + 1,
    name: `S${k + 1}`,
    state: k === n - 1 ? "active" : "closed",
    startDate: new Date(Date.UTC(2020, 0, 1) + k * 14 * 864e5).toISOString(),
    endDate: "e",
    originBoardId: 7,
    goal: "x",
  }));
const fakeJira =
  (all, urls = []) =>
  async (url) => {
    urls.push(url);
    const q = new URL(url).searchParams;
    const at = Number(q.get("startAt"));
    const max = Math.min(50, Number(q.get("maxResults")));
    const values = all.slice(at, at + max);
    return res(200, {
      total: all.length,
      startAt: at,
      isLast: at + values.length >= all.length,
      values,
    });
  };

test("fetchBoardSprints reads the total, then only the newest page when it reaches since", async () => {
  const all = board(128);
  const urls = [];
  const out = await fetchBoardSprints("https://j", 7, "a", {
    since: all[120].startDate,
    fetch: fakeJira(all, urls),
  });
  assert.equal(urls.length, 2);
  assert.match(
    urls[0],
    /\/rest\/agile\/1\.0\/board\/7\/sprint\?state=active,closed&startAt=0&maxResults=1$/,
  );
  assert.match(urls[1], /startAt=78&maxResults=50$/);
  assert.deepEqual(
    out.map((s) => s.id),
    all.slice(78).map((s) => s.id),
  );
  assert.equal(out[0].goal, undefined);
});

test("fetchBoardSprints walks back further pages until since and returns them in order", async () => {
  const all = board(128);
  const urls = [];
  const out = await fetchBoardSprints("https://j", 7, "a", {
    since: all[10].startDate,
    fetch: fakeJira(all, urls),
  });
  assert.deepEqual(
    urls.slice(1).map((u) => new URL(u).searchParams.get("startAt")),
    ["78", "28", "0"],
  );
  assert.equal(new URL(urls[3]).searchParams.get("maxResults"), "28");
  assert.deepEqual(
    out.map((s) => s.id),
    all.map((s) => s.id),
  );
});

test("fetchBoardSprints ignores other boards when deciding to stop, and handles small or empty boards", async () => {
  const all = board(60).map((s, k) =>
    k >= 10 ? { ...s, originBoardId: 9 } : s,
  );
  const urls = [];
  await fetchBoardSprints("https://j", 7, "a", {
    since: all[50].startDate,
    fetch: fakeJira(all, urls),
  });
  assert.equal(urls.length, 3);
  const small = [];
  assert.equal(
    (
      await fetchBoardSprints("https://j", 7, "a", {
        since: "2030-01-01T00:00:00Z",
        fetch: fakeJira(board(5), small),
      })
    ).length,
    5,
  );
  assert.match(small[1], /startAt=0&maxResults=5$/);
  const none = [];
  assert.deepEqual(
    await fetchBoardSprints("https://j", 7, "a", { fetch: fakeJira([], none) }),
    [],
  );
  assert.equal(none.length, 1);
});

test("fetchBoardSprints retries 429 using Retry-After and fails fast on 401", async () => {
  const waits = [];
  let n = 0;
  const flaky = async () =>
    ++n === 1
      ? res(429, {}, { "retry-after": "3" })
      : res(200, { total: 0, isLast: true, values: [] });
  assert.deepEqual(
    await fetchBoardSprints("https://j", 7, "a", {
      fetch: flaky,
      wait: async (ms) => waits.push(ms),
    }),
    [],
  );
  assert.deepEqual(waits, [3000]);
  await assert.rejects(
    fetchBoardSprints("https://j", 7, "a", {
      fetch: async () => res(401, {}),
      wait: async () => {},
    }),
    /401.*may have expired.*api-tokens/,
  );
});

test("tokenExpiryNotice warns within 14 days, flags a past date, and ignores a missing one", () => {
  const now = new Date("2026-11-19T12:00:00Z");
  assert.equal(tokenExpiryNotice({}, now), null);
  assert.equal(
    tokenExpiryNotice({ JIRA_TOKEN_EXPIRES: "2027-11-19" }, now),
    null,
  );
  assert.match(
    tokenExpiryNotice({ JIRA_TOKEN_EXPIRES: "2026-11-26" }, now),
    /expires on 2026-11-26 \(in 7 days\)/,
  );
  assert.match(
    tokenExpiryNotice({ JIRA_TOKEN_EXPIRES: "2026-11-01" }, now),
    /expired on 2026-11-01/,
  );
  assert.match(
    tokenExpiryNotice({ JIRA_TOKEN_EXPIRES: "soon" }, now),
    /not a date/,
  );
});
