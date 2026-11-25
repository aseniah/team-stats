import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { classifyEvent } from "./review-stats.mjs";

const COUNTED_STATES = new Set([
  "APPROVED",
  "CHANGES_REQUESTED",
  "COMMENTED",
  "DISMISSED",
]);
const SEARCH_CAP = 1000;

const execFileAsync = promisify(execFile);

export async function execGh(args) {
  const { stdout } = await execFileAsync("gh", args, {
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

const SECONDARY = /secondary rate limit|abuse detection|submitted too quickly/i;
const PRIMARY = /API rate limit exceeded/i;
const TRANSIENT =
  /HTTP 5\d\d|Something went wrong|timed? ?out|ECONNRESET|connection reset|unexpected EOF|TLS handshake/i;
const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rateLimitedBody = (out) => {
  try {
    return (
      JSON.parse(out).errors?.some((e) => e.type === "RATE_LIMITED") ?? false
    );
  } catch {
    return false;
  }
};

async function graphqlReset() {
  const { resources } = JSON.parse(await execGh(["api", "rate_limit"]));
  return resources.graphql.reset * 1000;
}

export class RateLimitExhausted extends Error {}

// A secondary limit waits a minute and doubles, as GitHub asks when no Retry-After is available.
export function withRetry(
  run,
  {
    sleep = sleepMs,
    now = Date.now,
    rateLimitReset = graphqlReset,
    maxWaitMs = 15 * 60_000,
    maxRetries = 5,
    log = (msg) => console.error(msg),
  } = {},
) {
  return async (args) => {
    let secondary = 0;
    for (let attempt = 0; ; attempt++) {
      let err;
      try {
        const out = await run(args);
        if (!rateLimitedBody(out)) return out;
        err = Object.assign(new Error("GitHub API rate limit exceeded"), {
          stdout: out,
        });
      } catch (e) {
        err = e;
      }
      const text = `${err.stderr ?? ""} ${err.message ?? ""}`;
      const kind = SECONDARY.test(text)
        ? "secondary"
        : PRIMARY.test(text) || rateLimitedBody(err.stdout)
          ? "primary"
          : TRANSIENT.test(text)
            ? "transient"
            : null;
      if (!kind || attempt >= maxRetries) throw err;
      let wait;
      if (kind === "primary") {
        const reset = await rateLimitReset();
        wait = Math.max(1_000, reset - now() + 1_000);
        if (wait > maxWaitMs) {
          throw new RateLimitExhausted(
            `GitHub's GraphQL rate limit is used up and resets at ${new Date(reset).toLocaleTimeString()}. Run the refresh again after that.`,
          );
        }
      } else if (kind === "secondary") {
        wait = 60_000 * 2 ** secondary++;
      } else {
        wait = 2_000 * 2 ** attempt;
      }
      log(
        `  GitHub ${kind === "transient" ? "request failed" : `${kind} rate limit`}, retrying in ${Math.round(wait / 1000)}s`,
      );
      await sleep(wait);
    }
  };
}

export const ghRun = withRetry(execGh);

export async function graphql(query, vars = {}, run = ghRun) {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [k, v] of Object.entries(vars)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => args.push("-f", `${k}[]=${x}`));
    else args.push("-f", `${k}=${v}`);
  }
  let out;
  try {
    out = await run(args);
  } catch (err) {
    if (err instanceof RateLimitExhausted) throw err;
    throw new Error(`gh api graphql failed: ${err.stderr || err.message}`);
  }
  const json = JSON.parse(out);
  if (json.errors?.length)
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  return json.data;
}

export function splitRange(from, to) {
  const mid = new Date((Date.parse(from) + Date.parse(to)) / 2).toISOString();
  return [
    [from, mid],
    [mid, to],
  ];
}

const SEARCH_QUERY = `query($q: String!, $after: String) {
  search(query: $q, type: ISSUE, first: 100, after: $after) {
    issueCount
    nodes { ... on PullRequest { id } }
    pageInfo { hasNextPage endCursor }
  }
}`;

// GitHub search qualifiers take second precision; flooring only widens the window, and ids are deduped.
const isoNoMs = (iso) => new Date(iso).toISOString().replace(/\.\d{3}Z$/, "Z");

export async function searchPrs(
  org,
  qualifier,
  since,
  until = null,
  run = ghRun,
) {
  const range = until
    ? `${isoNoMs(since)}..${isoNoMs(until)}`
    : `>=${isoNoMs(since)}`;
  const q = `org:${org} is:pr ${qualifier} updated:${range}`;
  const ids = [];
  let after = null;
  for (;;) {
    const { search } = await graphql(SEARCH_QUERY, { q, after }, run);
    if (search.issueCount > SEARCH_CAP) {
      if (
        Date.parse(until ?? new Date().toISOString()) - Date.parse(since) <
        2_000
      ) {
        throw new Error(
          `Search "${q}" has more than 1000 results within one second and cannot be split further.`,
        );
      }
      const [left, right] = splitRange(
        since,
        until ?? new Date().toISOString(),
      );
      return [
        ...new Set([
          ...(await searchPrs(org, qualifier, ...left, run)),
          ...(await searchPrs(org, qualifier, right[0], until, run)),
        ]),
      ];
    }
    ids.push(...search.nodes.map((n) => n.id).filter(Boolean));
    if (!search.pageInfo.hasNextPage) return [...new Set(ids)];
    after = search.pageInfo.endCursor;
  }
}

const REVIEW_FIELDS =
  "nodes { id state submittedAt body author { login } comments { totalCount } } pageInfo { hasNextPage endCursor }";

const BATCH_SIZE = 50;
const BATCH_CONCURRENCY = 3;

const PRS_QUERY = `query($ids: [ID!]!) {
  nodes(ids: $ids) { ... on PullRequest {
    id number url title mergedAt closedAt
    repository { nameWithOwner }
    author { login }
    reviews(first: 100) { ${REVIEW_FIELDS} }
  } }
}`;

const pageQuery = (conn, fields) => `query($id: ID!, $after: String) {
  node(id: $id) { ... on PullRequest { ${conn}(first: 100, after: $after) { ${fields} } } }
}`;

async function drain(id, conn, fields, first, run) {
  const nodes = [...first.nodes];
  let info = first.pageInfo;
  while (info.hasNextPage) {
    const data = await graphql(
      pageQuery(conn, fields),
      { id, after: info.endCursor },
      run,
    );
    const pageData = data.node[conn];
    nodes.push(...pageData.nodes);
    info = pageData.pageInfo;
  }
  return nodes;
}

export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

export async function fetchPrs(ids, run = ghRun, { onBatch = () => {} } = {}) {
  const batches = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE)
    batches.push(ids.slice(i, i + BATCH_SIZE));
  const results = await mapLimit(batches, BATCH_CONCURRENCY, async (batch) => {
    const { nodes } = await graphql(PRS_QUERY, { ids: batch }, run);
    const prs = [];
    for (const node of nodes) {
      if (!node?.id) continue;
      const reviews = await drain(
        node.id,
        "reviews",
        REVIEW_FIELDS,
        node.reviews,
        run,
      );
      prs.push(toPr(node, reviews));
    }
    onBatch(batch.length);
    return prs;
  });
  return results.flat();
}

function toPr(node, reviews) {
  return {
    repo: node.repository.nameWithOwner,
    number: node.number,
    url: node.url,
    title: node.title,
    author: node.author?.login ?? null,
    mergedAt: node.mergedAt,
    closedAt: node.closedAt,
    reviews: reviews.map((r) => ({
      id: r.id,
      state: r.state,
      submittedAt: r.submittedAt,
      author: r.author?.login ?? null,
      hasBody: Boolean(r.body?.trim()),
      inlineComments: r.comments?.totalCount ?? 0,
    })),
  };
}

export function toEvents(pr, logins, since) {
  const sinceMs = Date.parse(since);
  return pr.reviews
    .filter((r) => COUNTED_STATES.has(r.state) && r.submittedAt)
    .filter(
      (r) =>
        r.author &&
        logins.has(r.author) &&
        r.author !== pr.author &&
        Date.parse(r.submittedAt) >= sinceMs,
    )
    .map((r) => {
      const row = {
        id: r.id,
        at: r.submittedAt,
        login: r.author,
        kind: "review",
        state: r.state,
        repo: pr.repo,
        pr: pr.number,
        prAuthor: pr.author,
        prTitle: pr.title,
        url: pr.url,
      };
      const excluded = classifyEvent(
        { ...row, hasBody: r.hasBody, inlineComments: r.inlineComments },
        pr,
      );
      if (excluded) row.excluded = excluded;
      return row;
    });
}
