import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { authorizeBeforeAdminRender } from "../src/features/admin-shell/authorization-runtime.ts";
import {
  adminNavigation,
  futureAdminSections,
} from "../src/features/admin-shell/navigation.ts";
import {
  closeAdminMobileMenu,
  handleAdminMenuCancel,
  isAdminNavigationActive,
  isAdminNavigationGroupActive,
  openAdminMobileMenu,
} from "../src/features/admin-shell/runtime.ts";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

function createDialog() {
  const events = [];
  const dialog = {
    open: false,
    showModal() {
      events.push("showModal");
      this.open = true;
    },
    close() {
      events.push("close");
      this.open = false;
    },
  };

  return { dialog, events };
}

test("admin authorization completes before shell rendering", async () => {
  const events = [];
  let releaseAuthorization;

  const resultPromise = authorizeBeforeAdminRender(
    () =>
      new Promise((resolve) => {
        events.push("authorize:start");
        releaseAuthorization = () => {
          events.push("authorize:done");
          resolve();
        };
      }),
    () => {
      events.push("render:shell");
      return "shell";
    },
  );

  await Promise.resolve();
  assert.deepEqual(events, ["authorize:start"]);

  releaseAuthorization();
  assert.equal(await resultPromise, "shell");
  assert.deepEqual(events, ["authorize:start", "authorize:done", "render:shell"]);
});

test("failed admin authorization never renders the shell", async () => {
  let rendered = false;

  await assert.rejects(
    authorizeBeforeAdminRender(
      async () => {
        throw new Error("denied");
      },
      () => {
        rendered = true;
        return "shell";
      },
    ),
    /denied/,
  );

  assert.equal(rendered, false);
});

test("admin mobile menu opens once and closes on route navigation", () => {
  const { dialog, events } = createDialog();

  openAdminMobileMenu(dialog);
  openAdminMobileMenu(dialog);
  assert.equal(dialog.open, true);
  assert.deepEqual(events, ["showModal"]);

  closeAdminMobileMenu(dialog);
  assert.equal(dialog.open, false);
  assert.deepEqual(events, ["showModal", "close"]);

  closeAdminMobileMenu(dialog);
  assert.deepEqual(events, ["showModal", "close"]);
});

test("admin mobile menu handles Escape/cancel by preventing default and closing", () => {
  const { dialog, events } = createDialog();
  let prevented = false;

  openAdminMobileMenu(dialog);
  handleAdminMenuCancel(dialog, () => {
    prevented = true;
  });

  assert.equal(prevented, true);
  assert.equal(dialog.open, false);
  assert.deepEqual(events, ["showModal", "close"]);
});

test("admin navigation contains only implemented destinations with teaching children", () => {
  assert.deepEqual(
    adminNavigation.map((item) => item.label),
    ["الرئيسية", "تدريب إسلام", "عقل إسلام"],
  );

  const training = adminNavigation.find((item) => item.href === "/admin/teach");
  assert.ok(training && "children" in training);
  assert.deepEqual(
    training.children.map((item) => item.href),
    ["/admin/teach/text", "/admin/teach/voice", "/admin/teach/documents"],
  );

  const activeNavigation = JSON.stringify(adminNavigation);
  for (const section of futureAdminSections) {
    assert.equal(activeNavigation.includes(`/admin/${section.slug}`), false);
  }
});

test("admin navigation distinguishes exact links from active groups", () => {
  assert.equal(isAdminNavigationActive("/admin/teach", "/admin/teach"), true);
  assert.equal(isAdminNavigationActive("/admin/teach/text", "/admin/teach"), false);
  assert.equal(isAdminNavigationGroupActive("/admin/teach/text", "/admin/teach"), true);
  assert.equal(isAdminNavigationGroupActive("/admin/teach/documents", "/admin/teach"), true);
  assert.equal(isAdminNavigationGroupActive("/admin/brain", "/admin"), false);
});

test("production admin shell renders hierarchy and a deliberate user-space switch", () => {
  const shell = readSource("src/features/admin-shell/admin-shell.tsx");
  const layout = readSource("src/app/admin/layout.tsx");

  assert.match(shell, /^"use client";/);
  assert.match(shell, /isAdminNavigationGroupActive\(pathname, item\.href\)/);
  assert.match(shell, /item\.children\.map/);
  assert.match(shell, /href="\/app"/);
  assert.match(shell, /فتح مساحة المستخدم/);
  assert.match(shell, /aria-label="فتح قائمة الإدارة"/);
  assert.match(shell, /aria-label="إغلاق القائمة"/);
  assert.doesNotMatch(shell, /outline-none/);

  assert.match(layout, /authorizeBeforeAdminRender\(requireAdmin/);
  assert.match(layout, /<AdminShell>\{children\}<\/AdminShell>/);
});

test("admin home exposes only implemented workflows while unfinished direct routes return not found", () => {
  const home = readSource("src/app/admin/page.tsx");
  const section = readSource("src/app/admin/[section]/page.tsx");

  assert.match(home, /href: "\/admin\/teach"/);
  assert.match(home, /href: "\/admin\/brain"/);
  assert.doesNotMatch(home, /\/admin\/users|\/admin\/memory|\/admin\/knowledge/);
  assert.match(section, /import \{ notFound \} from "next\/navigation"/);
  assert.match(section, /notFound\(\)/);
  assert.doesNotMatch(section, /getAdminSection|params|section\.description/);
  assert.doesNotMatch(home + section, /supabase|openai|fetch\(|form action|server action/i);
});
