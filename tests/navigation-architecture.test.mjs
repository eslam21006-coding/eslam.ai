import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

const importSource = (relativePath) =>
  import(new URL(`../${relativePath}`, import.meta.url).href);

test("navigation architecture has one role-aware entry and separate user/admin workspaces", async () => {
  const { resolveEslamEntryDestination } = await importSource(
    "src/features/auth/entry-routing.ts",
  );
  const root = readSource("src/app/page.tsx");
  const appLayout = readSource("src/app/app/layout.tsx");
  const adminLayout = readSource("src/app/admin/layout.tsx");

  assert.equal(resolveEslamEntryDestination(null, false), "/auth/login");
  assert.equal(resolveEslamEntryDestination("user-1", true), "/admin");
  assert.equal(resolveEslamEntryDestination("user-1", false), "/app");
  assert.match(root, /resolveEslamEntryDestination/);
  assert.match(appLayout, /showAdminPortal/);
  assert.match(adminLayout, /requireAdmin/);
});

test("Teach Eslam is a hub with text voice documents feeding Brain review", () => {
  const hub = readSource("src/app/admin/teach/page.tsx");
  const text = readSource("src/app/admin/teach/text/page.tsx");
  const voice = readSource("src/app/admin/teach/voice/page.tsx");
  const documents = readSource("src/app/admin/teach/documents/page.tsx");

  for (const href of ["/admin/teach/text", "/admin/teach/voice", "/admin/teach/documents"]) {
    assert.match(hub, new RegExp(href.replaceAll("/", "\\/")));
  }
  assert.match(text, /\/admin\/brain/);
  assert.match(voice, /\/admin\/brain/);
  assert.match(documents, /\/admin\/brain/);
});
