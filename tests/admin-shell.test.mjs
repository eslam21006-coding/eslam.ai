import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("admin layout preserves the Task 11 authorization boundary and wraps the shell", () => {
  const layout = readSource("src/app/admin/layout.tsx");

  assert.match(layout, /await requireAdmin\(\)/);
  assert.match(layout, /<AdminShell>\{children\}<\/AdminShell>/);
});

test("admin navigation exposes the full Task 12 information architecture only", () => {
  const navigation = readSource("src/features/admin-shell/navigation.ts");
  const labels = [
    "المستخدمون",
    "المحادثات",
    "علّم إسلام",
    "ذاكرة إسلام",
    "عقل إسلام",
    "معرفة إسلام",
    "الحالات والأمثلة",
    "الإعدادات",
  ];

  for (const label of labels) assert.match(navigation, new RegExp(label));
  assert.equal((navigation.match(/href: "\/admin\//g) ?? []).length, 8);
});

test("admin shell is responsive, accessible, and closes the mobile modal safely", () => {
  const shell = readSource("src/features/admin-shell/admin-shell.tsx");

  assert.match(shell, /^"use client";/);
  assert.match(shell, /aria-label="تنقل الإدارة"/);
  assert.match(shell, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(shell, /showModal\(\)/);
  assert.match(shell, /window\.matchMedia\("\(min-width: 64rem\)"\)/);
  assert.match(shell, /addEventListener\("change", closeAtDesktop\)/);
  assert.match(shell, /removeEventListener\("change", closeAtDesktop\)/);
  assert.match(shell, /aria-label="فتح قائمة الإدارة"/);
  assert.match(shell, /aria-label="إغلاق القائمة"/);
  assert.match(shell, /lang="en" dir="ltr"/);
  assert.match(shell, /ESLAM\.AI/);
  assert.doesNotMatch(shell, /outline-none/);
});

test("admin home and section destinations stay presentation-only", () => {
  const home = readSource("src/app/admin/page.tsx");
  const section = readSource("src/app/admin/[section]/page.tsx");

  assert.match(home, /adminNavigation\.map/);
  assert.match(section, /getAdminSection\(slug\)/);
  assert.match(section, /if \(!section\) notFound\(\)/);
  assert.doesNotMatch(home + section, /supabase|openai|fetch\(|form action|server action/i);
});
