import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("repository foundation exposes required validation scripts", () => {
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.scripts.lint, "eslint . --max-warnings=0");
  assert.equal(packageJson.scripts.typecheck, "tsc --noEmit");
  assert.equal(packageJson.scripts.build, "next build");
});

test("Next.js App Router entry point exists", () => {
  assert.equal(existsSync(new URL("../src/app/page.tsx", import.meta.url)), true);
  assert.equal(existsSync(new URL("../src/app/layout.tsx", import.meta.url)), true);
});
