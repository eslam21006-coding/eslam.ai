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

test("central entry routes unauthenticated, admin, and normal users into separate workspaces", () => {
  const root = readSource("src/app/page.tsx");
  const session = readSource("src/lib/auth/session.ts");

  assert.match(root, /getAuthenticatedUserId\(\)/);
  assert.match(root, /redirect\("\/auth\/login"\)/);
  assert.match(root, /isAdmin\(\)/);
  assert.match(root, /redirect\("\/admin"\)/);
  assert.match(root, /redirect\("\/app"\)/);
  assert.match(session, /redirect\("\/"\)/);
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

test("email password actions preserve credentials and return successful auth to the role router", () => {
  const actions = readSource("src/features/auth/actions.ts");
  const chat = readSource("src/app/app/chat/page.tsx");

  assert.match(actions, /name === "email" \? value\.trim\(\) : value/);
  assert.match(actions, /signInWithPassword/);
  assert.match(actions, /auth\.signUp/);
  assert.match(actions, /\.from\("profiles"\)/);
  assert.match(actions, /ignoreDuplicates: true/);
  assert.match(actions, /recoverFromProfileFailure/);
  assert.match(actions, /profile_init_failed/);
  assert.match(actions, /const \{ error \} = await supabase\.auth\.signOut\(\)/);
  assert.match(actions, /logout_failed/);
  assert.equal((actions.match(/redirect\("\/"\)/g) ?? []).length, 2);
  assert.doesNotMatch(actions, /error\.message/);
  assert.match(chat, /role="alert"/);
  assert.match(chat, /logout_failed/);
  assert.match(chat, /profile_init_failed/);
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
  assert.match(login, /profile_init_failed/);
  assert.match(signup, /redirectAuthenticatedUser\(\)/);
  assert.match(shell, /logoutAction/);
  assert.match(shell, /تسجيل الخروج/);
});
