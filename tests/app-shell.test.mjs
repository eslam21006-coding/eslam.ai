import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("/app routes into mentee chat and resolves whether the admin switch is available", () => {
  const appPage = readSource("src/app/app/page.tsx");
  const layout = readSource("src/app/app/layout.tsx");

  assert.match(appPage, /redirect\("\/app\/chat"\)/);
  assert.match(layout, /listConversations\(userId\)/);
  assert.match(layout, /isAdmin\(\)/);
  assert.match(layout, /showAdminPortal=\{showAdminPortal\}/);
  assert.match(layout, /conversations=\{conversations \?\? \[\]\}/);
});

test("user shell keeps normal navigation minimal and exposes admin switch conditionally", () => {
  const shell = readSource("src/features/app-shell/app-shell.tsx");

  for (const label of ["محادثة جديدة", "المحادثات السابقة", "الملف التجاري"]) {
    assert.match(shell, new RegExp(label));
  }

  assert.match(shell, /aria-label="التنقل الرئيسي"/);
  assert.match(shell, /aria-current=/);
  assert.match(shell, /showAdminPortal \? \(/);
  assert.match(shell, /href="\/admin"/);
  assert.match(shell, /لوحة الإدارة/);
  assert.match(shell, /showAdminPortal = false/);
  assert.match(shell, /conversations\.map/);
  assert.match(shell, /`\/app\/chat\/\$\{conversation\.id\}`/);
  assert.doesNotMatch(shell, /\/admin\/teach|\/admin\/brain/);
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
  const page = readSource("src/app/app/chat/page.tsx");
  const chat = readSource("src/features/conversations/conversation-chat.tsx");
  const composer = readSource("src/features/conversations/conversation-composer.tsx");

  assert.match(page, /ConversationChat/);
  assert.match(chat, /ConversationComposer/);
  assert.match(chat, /أول رسالة هتبدأ محادثة محفوظة/);
  assert.match(composer, /aria-label="رسالتك"/);
  assert.match(composer, /maxLength=\{MAX_MESSAGE_LENGTH\}/);
  assert.doesNotMatch(composer, /outline-none/);
});

test("Business DNA remains a dedicated user destination", () => {
  const business = readSource("src/app/app/business/page.tsx");

  assert.match(business, /الملف التجاري/);
  assert.match(business, /Business DNA/);
  assert.match(business, /requireAuthenticatedUser\(\)/);
});
