import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("repository foundation exposes required validation scripts", () => {
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.scripts.lint, "eslint . --max-warnings=0");
  assert.equal(packageJson.scripts.typecheck, "tsc --noEmit");
  assert.equal(packageJson.scripts.test, "node --test");
  assert.equal(packageJson.scripts.build, "next build");
});

test("Next.js App Router entry point preserves Arabic RTL semantics", () => {
  const pageUrl = new URL("../src/app/page.tsx", import.meta.url);
  const layoutUrl = new URL("../src/app/layout.tsx", import.meta.url);

  assert.equal(existsSync(pageUrl), true);
  assert.equal(existsSync(layoutUrl), true);

  const layoutSource = readFileSync(layoutUrl, "utf8");
  assert.match(layoutSource, /lang="ar"/);
  assert.match(layoutSource, /dir="rtl"/);
});
