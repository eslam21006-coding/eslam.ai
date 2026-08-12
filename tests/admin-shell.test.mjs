import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { authorizeBeforeAdminRender } from "../src/features/admin-shell/authorization-runtime.ts";
import { adminNavigation } from "../src/features/admin-shell/navigation.ts";
import {
  closeAdminMobileMenu,
  handleAdminMenuCancel,
  isAdminNavigationActive,
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

test("admin navigation reports exactly one matching active route", () => {
  for (const item of adminNavigation) {
    const activeItems = adminNavigation.filter((candidate) =>
      isAdminNavigationActive(item.href, candidate.href),
    );

    assert.deepEqual(activeItems.map((candidate) => candidate.href), [item.href]);
  }

  assert.equal(isAdminNavigationActive("/admin", "/admin/users"), false);
  assert.equal(isAdminNavigationActive("/admin/users/other", "/admin/users"), false);
});

test("admin navigation exposes the full Task 12 information architecture only", () => {
  assert.deepEqual(
    adminNavigation.map((item) => item.label),
    [
      "المستخدمون",
      "المحادثات",
      "علّم إسلام",
      "ذاكرة إسلام",
      "عقل إسلام",
      "معرفة إسلام",
      "الحالات والأمثلة",
      "الإعدادات",
    ],
  );
  assert.equal(adminNavigation.length, 8);
  assert.ok(adminNavigation.every((item) => item.href.startsWith("/admin/")));
});

test("production admin shell wires the tested runtime behaviors", () => {
  const shell = readSource("src/features/admin-shell/admin-shell.tsx");
  const layout = readSource("src/app/admin/layout.tsx");

  assert.match(shell, /^"use client";/);
  assert.match(shell, /openAdminMobileMenu\(mobileMenuRef\.current\)/);
  assert.match(shell, /closeAdminMobileMenu\(mobileMenuRef\.current\)/);
  assert.match(shell, /handleAdminMenuCancel\(mobileMenuRef\.current/);
  assert.match(shell, /isAdminNavigationActive\(pathname, item\.href\)/);
  assert.match(shell, /window\.matchMedia\("\(min-width: 64rem\)"\)/);
  assert.match(shell, /addEventListener\("change", closeAtDesktop\)/);
  assert.match(shell, /removeEventListener\("change", closeAtDesktop\)/);
  assert.match(shell, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(shell, /aria-label="فتح قائمة الإدارة"/);
  assert.match(shell, /aria-label="إغلاق القائمة"/);
  assert.match(shell, /lang="en" dir="ltr"/);
  assert.doesNotMatch(shell, /outline-none/);

  assert.match(layout, /authorizeBeforeAdminRender\(requireAdmin/);
  assert.match(layout, /<AdminShell>\{children\}<\/AdminShell>/);
});

test("admin home and section destinations stay presentation-only", () => {
  const home = readSource("src/app/admin/page.tsx");
  const section = readSource("src/app/admin/[section]/page.tsx");

  assert.match(home, /adminNavigation\.map/);
  assert.match(section, /getAdminSection\(slug\)/);
  assert.match(section, /if \(!section\) notFound\(\)/);
  assert.doesNotMatch(home + section, /supabase|openai|fetch\(|form action|server action/i);
});
