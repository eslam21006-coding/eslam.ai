import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("/app routes into the mentee chat area and loads persisted conversation navigation", () => {
  const appPage = readSource("src/app/app/page.tsx");
  const layout = readSource("src/app/app/layout.tsx");

  assert.match(appPage, /redirect\("\/app\/chat"\)/);
  assert.match(layout, /listConversations\(userId\)/);
  assert.match(layout, /<AppShell/);
  assert.match(layout, /conversations=\{conversations \?\? \[\]\}/);
});

test("mentee shell exposes minimal Arabic navigation and persisted conversation links", () => {
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
  assert.match(shell, /conversations\.map/);
  assert.match(shell, /`\/app\/chat\/\$\{conversation\.id\}`/);
  assert.doesNotMatch(shell, /مراجعة أداء الـ Webinar|ارتفاع تكلفة الـ Meta Ads/);
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

test("new chat keeps the Arabic composer simple without suppressing focus", () => {
  const chat = readSource("src/app/app/chat/page.tsx");
  const composer = readSource("src/features/conversations/conversation-composer.tsx");

  assert.match(chat, /ConversationComposer/);
  assert.match(chat, /أول رسالة هتبدأ محادثة محفوظة/);
  assert.match(composer, /aria-label="رسالتك"/);
  assert.match(composer, /maxLength=\{MAX_MESSAGE_LENGTH\}/);
  assert.doesNotMatch(composer, /outline-none/);
});

test("Business DNA remains a dedicated mentee destination", () => {
  const business = readSource("src/app/app/business/page.tsx");

  assert.match(business, /الملف التجاري/);
  assert.match(business, /Business DNA/);
  assert.match(business, /requireAuthenticatedUser\(\)/);
});
