import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(repo, p), "utf8");

test("the newest CHANGELOG.md entry matches the package.json version", () => {
  const { version } = JSON.parse(read("package.json"));
  const newest = read("CHANGELOG.md").match(/^## (\S+)/m)?.[1];
  assert.equal(newest, version);
});
