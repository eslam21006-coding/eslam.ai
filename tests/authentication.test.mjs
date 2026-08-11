import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("protected routes verify claims rather than trusting session storage", () => {
  const session = readSource("src/lib/auth/session.ts");
  const appLayout = readSource("src/app/app/layout.tsx");

  assert.match(session, /auth\.getClaims\(\)/);
  assert.doesNotMatch(session, /auth\.getSession\(\)/);
  assert.match(session, /redirect\("\/auth\/login"\)/);
  assert.match(appLayout, /requireAuthenticatedUser\(\)/);
});

test("Next.js proxy refreshes Supabase auth using bulk cookie APIs", () => {
  const proxy = readSource("src/proxy.ts");
  const sessionProxy = readSource("src/lib/supabase/proxy.ts");

  assert.match(proxy, /export async function proxy/);
  assert.match(proxy, /updateSession\(request\)/);
  assert.match(sessionProxy, /createServerClient<Database>/);
  assert.match(sessionProxy, /getAll\(\)/);
  assert.match(sessionProxy, /setAll\(cookiesToSet, responseHeaders\)/);
  assert.match(sessionProxy, /auth\.getClaims\(\)/);
  assert.doesNotMatch(sessionProxy, /auth\.getSession\(\)/);
  assert.doesNotMatch(sessionProxy, /SERVICE_ROLE|SECRET_KEY/i);
});

test("email password actions cover signup login logout and profile initialization", () => {
  const actions = readSource("src/features/auth/actions.ts");

  assert.match(actions, /signInWithPassword/);
  assert.match(actions, /auth\.signUp/);
  assert.match(actions, /auth\.signOut/);
  assert.match(actions, /\.from\("profiles"\)/);
  assert.match(actions, /ignoreDuplicates: true/);
  assert.match(actions, /redirect\("\/app\/chat"\)/);
  assert.doesNotMatch(actions, /error\.message/);
});

test("auth UI is Arabic RTL-compatible and offers both account flows", () => {
  const card = readSource("src/features/auth/auth-card.tsx");
  const login = readSource("src/app/auth/login/page.tsx");
  const signup = readSource("src/app/auth/signup/page.tsx");
  const shell = readSource("src/features/app-shell/app-shell.tsx");

  assert.match(card, /type="email"/);
  assert.match(card, /type="password"/);
  assert.match(card, /\/auth\/signup/);
  assert.match(card, /\/auth\/login/);
  assert.match(login, /redirectAuthenticatedUser\(\)/);
  assert.match(signup, /redirectAuthenticatedUser\(\)/);
  assert.match(shell, /logoutAction/);
  assert.match(shell, /تسجيل الخروج/);
});
