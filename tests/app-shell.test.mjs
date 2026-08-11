import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("/app routes into the mentee chat area", () => {
  const appPage = readSource("src/app/app/page.tsx");
  const layout = readSource("src/app/app/layout.tsx");

  assert.match(appPage, /redirect\("\/app\/chat"\)/);
  assert.match(layout, /<AppShell>/);
});

test("mentee shell exposes the minimal Arabic navigation contract", () => {
  const shell = readSource("src/features/app-shell/app-shell.tsx");

  for (const label of ["محادثة جديدة", "المحادثات السابقة", "الملف التجاري"]) {
    assert.match(shell, new RegExp(label));
  }

  assert.match(shell, /aria-label="التنقل الرئيسي"/);
  assert.match(shell, /aria-current=/);
  assert.match(shell, /showModal\(\)/);
  assert.match(shell, /aria-label="قائمة التنقل"/);
  assert.match(shell, /lang="en"/);
  assert.match(shell, /dir="ltr"/);
});

test("mobile dialog closes when the shell crosses into the desktop breakpoint", () => {
  const shell = readSource("src/features/app-shell/app-shell.tsx");

  assert.match(shell, /matchMedia\("\(min-width: 64rem\)"\)/);
  assert.match(shell, /desktopBreakpoint\.matches/);
  assert.match(shell, /mobileMenuRef\.current\?\.open/);
  assert.match(shell, /mobileMenuRef\.current\.close\(\)/);
  assert.match(shell, /addEventListener\("change", closeAtDesktop\)/);
  assert.match(shell, /removeEventListener\("change", closeAtDesktop\)/);
});

test("chat shell keeps mixed Arabic and English readable without suppressing focus", () => {
  const chat = readSource("src/app/app/chat/page.tsx");

  assert.match(chat, /text-mixed/);
  assert.match(chat, /Webinar/);
  assert.match(chat, /Meta Ads|spend/);
  assert.match(chat, /aria-label="رسالتك"/);
  assert.doesNotMatch(chat, /outline-none/);
});

test("Business DNA remains a dedicated mentee destination", () => {
  const business = readSource("src/app/app/business/page.tsx");

  assert.match(business, /الملف التجاري/);
  assert.match(business, /Business DNA/);
  assert.match(business, /requireAuthenticatedUser\(\)/);
});
