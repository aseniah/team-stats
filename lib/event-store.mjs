import fs from "node:fs";
import path from "node:path";

const KEY_ORDER = [
  "id",
  "at",
  "login",
  "kind",
  "state",
  "repo",
  "pr",
  "prAuthor",
  "prTitle",
  "url",
  "excluded",
];

export function monthKey(at) {
  return new Date(at).toISOString().slice(0, 7);
}

function compareEvents(a, b) {
  const t = Date.parse(a.at) - Date.parse(b.at);
  if (t !== 0) return t;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function mergeMonth(existing, fresh, since) {
  const sinceMs = Date.parse(since);
  const byId = new Map();
  for (const ev of existing) {
    if (Date.parse(ev.at) < sinceMs) byId.set(ev.id, ev);
  }
  for (const ev of fresh) byId.set(ev.id, ev);
  return [...byId.values()].sort(compareEvents);
}

function readFileEvents(file) {
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

export function readEvents(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".jsonl"))
    .sort()
    .flatMap((name) => readFileEvents(path.join(dir, name)));
}

function serialize(ev) {
  const ordered = {};
  for (const key of KEY_ORDER) {
    if (key === "excluded" && ev.excluded === undefined) continue;
    ordered[key] = ev[key];
  }
  return JSON.stringify(ordered);
}

function monthsBetween(fromKey, toKey) {
  const months = [];
  let [y, m] = fromKey.split("-").map(Number);
  const [ty, tm] = toKey.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

export function writeWindow(dir, fresh, since, now) {
  fs.mkdirSync(dir, { recursive: true });
  const written = [];
  for (const month of monthsBetween(monthKey(since), monthKey(now))) {
    const file = path.join(dir, `${month}.jsonl`);
    const existing = fs.existsSync(file) ? readFileEvents(file) : [];
    const monthFresh = fresh.filter((ev) => monthKey(ev.at) === month);
    const rows = mergeMonth(existing, monthFresh, since);
    const body = rows.map((ev) => `${serialize(ev)}\n`).join("");
    fs.writeFileSync(file, body);
    written.push(file);
  }
  return written;
}
