import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fetchPrs,
  graphql,
  RateLimitExhausted,
  searchPrs,
  splitRange,
  toEvents,
  withRetry,
} from "../lib/github.mjs";

const queryOf = (args) => args[args.indexOf("-f") + 1].replace(/^query=/, "");
const varsOf = (args) => {
  const vars = {};
  for (let i = 0; i < args.length; i++) {
    if (
      (args[i] === "-f" || args[i] === "-F") &&
      !args[i + 1].startsWith("query=")
    ) {
      const [k, ...v] = args[i + 1].split("=");
      if (k.endsWith("[]")) (vars[k.slice(0, -2)] ??= []).push(v.join("="));
      else vars[k] = v.join("=");
    }
  }
  return vars;
};

const basePr = {
  repo: "acme/widgets",
  number: 7,
  url: "https://github.com/acme/widgets/pull/7",
  title: "Add thing",
  author: "ben-gh",
  mergedAt: "2026-11-10T12:00:00Z",
  closedAt: "2026-11-10T12:00:00Z",
  reviews: [],
};
const review = (id, state, submittedAt, author, extra = {}) => ({
  id,
  state,
  submittedAt,
  author,
  hasBody: true,
  inlineComments: 0,
  ...extra,
});

test("splitRange halves a window", () => {
  assert.deepEqual(
    splitRange("2026-11-01T00:00:00.000Z", "2026-11-03T00:00:00.000Z"),
    [
      ["2026-11-01T00:00:00.000Z", "2026-11-02T00:00:00.000Z"],
      ["2026-11-02T00:00:00.000Z", "2026-11-03T00:00:00.000Z"],
    ],
  );
});

test("toEvents filters states, authors, non-members, and tags exclusions", () => {
  const pr = {
    ...basePr,
    reviews: [
      review("r1", "APPROVED", "2026-11-09T00:00:00Z", "ada-gh"),
      review("r2", "PENDING", null, "ada-gh"),
      review("r3", "COMMENTED", "2026-11-09T01:00:00Z", "ben-gh"),
      review(
        "r4",
        "COMMENTED",
        "2026-11-09T01:00:00Z",
        "copilot-pull-request-reviewer",
      ),
      review("r5", "APPROVED", "2026-11-11T00:00:00Z", "cleo-gh"),
      review("r6", "DISMISSED", "2026-11-09T02:00:00Z", "cleo-gh"),
      review("r7", "APPROVED", "2026-10-01T00:00:00Z", "cleo-gh"),
    ],
  };
  const logins = new Set(["ben-gh", "ada-gh", "cleo-gh", "dev-gh"]);
  const events = toEvents(pr, logins, "2026-11-01T00:00:00Z");
  assert.deepEqual(
    events.map((e) => [e.id, e.excluded ?? null]),
    [
      ["r1", null],
      ["r5", "after-merge"],
      ["r6", null],
    ],
  );
  assert.deepEqual(events[0], {
    id: "r1",
    at: "2026-11-09T00:00:00Z",
    login: "ada-gh",
    kind: "review",
    state: "APPROVED",
    repo: "acme/widgets",
    pr: 7,
    prAuthor: "ben-gh",
    prTitle: "Add thing",
    url: basePr.url,
  });
});

test("toEvents counts each submitted review, and not standalone inline comments", () => {
  const pr = {
    ...basePr,
    mergedAt: null,
    closedAt: null,
    reviews: [
      review("r1", "COMMENTED", "2026-11-02T00:00:00Z", "ada-gh", {
        hasBody: true,
        inlineComments: 0,
      }),
      review("r2", "COMMENTED", "2026-11-03T00:00:00Z", "ada-gh", {
        hasBody: false,
        inlineComments: 3,
      }),
      review("r3", "COMMENTED", "2026-11-04T00:00:00Z", "ada-gh", {
        hasBody: false,
        inlineComments: 1,
      }),
      review("r4", "APPROVED", "2026-11-05T00:00:00Z", "ada-gh", {
        hasBody: false,
        inlineComments: 0,
      }),
      review("r5", "CHANGES_REQUESTED", "2026-11-05T00:00:00Z", "ada-gh", {
        hasBody: false,
        inlineComments: 1,
      }),
    ],
  };
  const events = toEvents(pr, new Set(["ada-gh"]), "2026-11-01T00:00:00Z");
  assert.deepEqual(
    events.map((e) => [e.id, e.excluded ?? null]),
    [
      ["r1", null],
      ["r2", null],
      ["r3", "inline-comment"],
      ["r4", null],
      ["r5", null],
    ],
  );
});

const page = (nodes, next) => ({
  nodes,
  pageInfo: { hasNextPage: !!next, endCursor: next ?? null },
});
const prData = (id, reviewsPage) => ({
  id,
  number: Number(id.replace(/\D/g, "")),
  url: `https://github.com/acme/widgets/pull/${id}`,
  title: `PR ${id}`,
  mergedAt: null,
  closedAt: null,
  repository: { nameWithOwner: "acme/widgets" },
  author: { login: "ben-gh" },
  reviews: reviewsPage,
});
const rev = (id, author, extra = {}) => ({
  id,
  state: "APPROVED",
  submittedAt: "2026-11-09T00:00:00Z",
  body: "",
  author: author && { login: author },
  comments: { totalCount: 0 },
  ...extra,
});

function fakeGitHub(prs, { pageSize = 100 } = {}) {
  const calls = [];
  const run = (args) => {
    calls.push(args);
    const q = queryOf(args);
    const vars = varsOf(args);
    if (q.includes("nodes(ids: $ids)")) {
      return JSON.stringify({
        data: {
          nodes: vars.ids.map((id) => {
            const all = prs[id];
            if (!all) return null;
            return prData(
              id,
              page(
                all.slice(0, pageSize),
                all.length > pageSize ? `${id}:${pageSize}` : null,
              ),
            );
          }),
        },
      });
    }
    const [id, offset] = vars.after.split(":");
    const rest = prs[id].slice(Number(offset), Number(offset) + pageSize);
    const next =
      Number(offset) + pageSize < prs[id].length
        ? `${id}:${Number(offset) + pageSize}`
        : null;
    assert.match(q, /reviews\(first: 100, after: \$after\)/);
    return JSON.stringify({ data: { node: { reviews: page(rest, next) } } });
  };
  return { run, calls };
}

test("fetchPrs fetches up to 50 PRs per call and keeps input order", async () => {
  const prs = Object.fromEntries(
    Array.from({ length: 120 }, (_, i) => [
      `PR_${i}`,
      [rev(`r${i}`, "ada-gh")],
    ]),
  );
  const { run, calls } = fakeGitHub(prs);
  const out = await fetchPrs(Object.keys(prs), run);
  assert.equal(calls.length, 3);
  assert.ok(calls.every((c) => varsOf(c).ids.length <= 50));
  assert.deepEqual(
    out.map((p) => p.number),
    Object.keys(prs).map((id) => Number(id.slice(3))),
  );
  assert.equal(out[5].repo, "acme/widgets");
});

test("fetchPrs follows review pagination per PR and reads body and inline comment count", async () => {
  const many = Array.from({ length: 230 }, (_, i) => rev(`m${i}`, "ada-gh"));
  const prs = {
    PR_1: many,
    PR_2: [
      rev("x1", "ada-gh", { body: "  " }),
      rev("x2", "cleo-gh", {
        state: "COMMENTED",
        body: "Looks close",
        comments: { totalCount: 4 },
      }),
    ],
  };
  const { run, calls } = fakeGitHub(prs);
  const [a, b] = await fetchPrs(["PR_1", "PR_2"], run);
  assert.equal(a.reviews.length, 230);
  assert.deepEqual(
    a.reviews.map((r) => r.id),
    many.map((r) => r.id),
  );
  assert.deepEqual(
    b.reviews.map((r) => [r.id, r.author, r.hasBody, r.inlineComments]),
    [
      ["x1", "ada-gh", false, 0],
      ["x2", "cleo-gh", true, 4],
    ],
  );
  assert.equal(calls.length, 3);
});

test("fetchPrs skips deleted PRs and tolerates deleted users", async () => {
  const { run } = fakeGitHub({ PR_1: [rev("r1", null)] });
  const out = await fetchPrs(["PR_1", "PR_9"], run);
  assert.equal(out.length, 1);
  assert.equal(out[0].reviews[0].author, null);
});

const failure = (stderr) =>
  Object.assign(new Error("Command failed: gh api graphql"), { stderr });
const ok = JSON.stringify({ data: { ok: true } });

test("withRetry waits for the reset on a primary rate limit, then retries", async () => {
  const waits = [];
  let n = 0;
  const run = withRetry(
    () =>
      n++ === 0
        ? Promise.reject(
            failure("GraphQL: API rate limit exceeded for user ID 1."),
          )
        : ok,
    {
      sleep: async (ms) => waits.push(ms),
      now: () => 1_000_000,
      rateLimitReset: async () => 1_000_000 + 90_000,
      log: () => {},
    },
  );
  assert.equal(await run(["api", "graphql"]), ok);
  assert.equal(n, 2);
  assert.deepEqual(waits, [91_000]);
});

test("withRetry treats a RATE_LIMITED error in the response body as a primary rate limit", async () => {
  let n = 0;
  const limited = JSON.stringify({
    errors: [{ type: "RATE_LIMITED", message: "API rate limit exceeded" }],
  });
  const run = withRetry(
    () =>
      n++ === 0
        ? Promise.reject(Object.assign(failure(""), { stdout: limited }))
        : ok,
    {
      sleep: async () => {},
      now: () => 0,
      rateLimitReset: async () => 5_000,
      log: () => {},
    },
  );
  assert.equal(await run([]), ok);
  assert.equal(n, 2);
});

test("withRetry gives up with a clear message when the reset is too far away", async () => {
  const run = withRetry(
    () => Promise.reject(failure("API rate limit exceeded")),
    {
      sleep: async () => assert.fail("should not wait"),
      now: () => 0,
      rateLimitReset: async () => 40 * 60_000,
      maxWaitMs: 15 * 60_000,
      log: () => {},
    },
  );
  await assert.rejects(
    run([]),
    (e) =>
      e instanceof RateLimitExhausted &&
      /rate limit.*resets at/i.test(e.message),
  );
  await assert.rejects(graphql("query { x }", {}, run), RateLimitExhausted);
});

test("withRetry backs off on secondary rate limits and transient errors", async () => {
  const waits = [];
  const errors = [
    failure("HTTP 403: You have exceeded a secondary rate limit."),
    failure("HTTP 502: Bad Gateway"),
    failure("read: connection reset by peer"),
  ];
  let n = 0;
  const run = withRetry(
    () => (n < errors.length ? Promise.reject(errors[n++]) : ok),
    {
      sleep: async (ms) => waits.push(ms),
      now: () => 0,
      rateLimitReset: async () => assert.fail("not a primary limit"),
      log: () => {},
    },
  );
  assert.equal(await run([]), ok);
  assert.equal(waits[0], 60_000);
  assert.ok(waits[1] >= 1_000 && waits[1] < 60_000 && waits[2] > waits[1]);
});

test("withRetry stops after its retry budget and does not retry other errors", async () => {
  let n = 0;
  const flaky = withRetry(
    () => {
      n++;
      return Promise.reject(failure("HTTP 502: Bad Gateway"));
    },
    { sleep: async () => {}, now: () => 0, log: () => {}, maxRetries: 3 },
  );
  await assert.rejects(flaky([]), (e) => /502/.test(e.stderr));
  assert.equal(n, 4);
  let m = 0;
  const broken = withRetry(
    () => {
      m++;
      return Promise.reject(failure("HTTP 401: Bad credentials"));
    },
    { sleep: async () => {}, now: () => 0, log: () => {} },
  );
  await assert.rejects(broken([]), (e) => /401/.test(e.stderr));
  assert.equal(m, 1);
});

test("searchPrs splits the range when results exceed 1000", async () => {
  const seen = [];
  const run = (args) => {
    const q = varsOf(args).q;
    seen.push(q);
    const isWhole = q.includes("2026-11-01T00:00:00Z..2026-11-03T00:00:00Z");
    return JSON.stringify({
      data: {
        search: {
          issueCount: isWhole ? 1500 : 1,
          nodes: isWhole ? [] : [{ id: `PR_${seen.length}` }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    });
  };
  const ids = await searchPrs(
    "acme",
    "reviewed-by:ada-gh",
    "2026-11-01T00:00:00.000Z",
    "2026-11-03T00:00:00.000Z",
    run,
  );
  assert.equal(seen.length, 3);
  assert.match(seen[0], /^org:acme is:pr reviewed-by:ada-gh updated:/);
  assert.deepEqual(ids, ["PR_2", "PR_3"]);
});

test("searchPrs is open-ended by default", async () => {
  const qs = [];
  const run = (args) => {
    qs.push(varsOf(args).q);
    return JSON.stringify({
      data: {
        search: {
          issueCount: 1,
          nodes: [{ id: "PR_1" }],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    });
  };
  await searchPrs(
    "acme",
    "reviewed-by:ben-gh",
    "2026-11-04T17:00:30.250Z",
    null,
    run,
  );
  assert.equal(
    qs[0],
    "org:acme is:pr reviewed-by:ben-gh updated:>=2026-11-04T17:00:30Z",
  );
});

test("withRetry returns a good response that mentions RATE_LIMITED in its data", async () => {
  let n = 0;
  const body = JSON.stringify({
    data: { nodes: [{ title: "Retry on RATE_LIMITED responses" }] },
  });
  const run = withRetry(
    () => {
      n++;
      return body;
    },
    {
      sleep: async () => assert.fail("no wait"),
      now: () => 0,
      rateLimitReset: async () => assert.fail("no reset"),
      log: () => {},
    },
  );
  assert.equal(await run([]), body);
  assert.equal(n, 1);
});

test("withRetry ignores retry words that only appear in response data", async () => {
  let n = 0;
  const err = Object.assign(failure("HTTP 401: Bad credentials"), {
    stdout: JSON.stringify({
      data: { title: "Fix timeout and HTTP 502 handling" },
    }),
  });
  const run = withRetry(
    () => {
      n++;
      return Promise.reject(err);
    },
    { sleep: async () => {}, now: () => 0, log: () => {} },
  );
  await assert.rejects(run([]));
  assert.equal(n, 1);
});

test("searchPrs stops splitting when one second holds more than 1000 results", async () => {
  let calls = 0;
  const run = () => {
    if (++calls > 50) throw new Error("runaway");
    return JSON.stringify({
      data: {
        search: {
          issueCount: 1500,
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
        },
      },
    });
  };
  await assert.rejects(
    searchPrs(
      "acme",
      "reviewed-by:ada-gh",
      "2026-11-01T00:00:00.000Z",
      "2026-11-03T00:00:00.000Z",
      run,
    ),
    /more than 1000/,
  );
});
