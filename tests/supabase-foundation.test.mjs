import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("Supabase packages are pinned and Node runtime matches the current SDK", () => {
  const pkg = JSON.parse(readSource("package.json"));

  assert.equal(pkg.engines.node, ">=22.0.0");
  assert.equal(pkg.dependencies["@supabase/ssr"], "0.12.4");
  assert.equal(pkg.dependencies["@supabase/supabase-js"], "2.111.0");
  assert.equal(pkg.devDependencies.supabase, "2.110.0");
  assert.match(pkg.scripts["db:types:local"], /supabase gen types typescript --local/);
  assert.match(pkg.scripts["db:types:linked"], /supabase gen types typescript --linked/);
});

test("public Supabase env contract never exposes privileged credentials", () => {
  const env = readSource(".env.example");
  const browserClient = readSource("src/lib/supabase/client.ts");

  assert.match(env, /NEXT_PUBLIC_SUPABASE_URL=/);
  assert.match(env, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=/);
  assert.doesNotMatch(env, /NEXT_PUBLIC_.*(?:SERVICE_ROLE|SECRET_KEY)/i);
  assert.doesNotMatch(browserClient, /service[_-]?role|secret[_-]?key/i);
  assert.match(browserClient, /createBrowserClient<Database>/);
});

test("server Supabase client uses cookie-aware SSR plumbing and stays server-only", () => {
  const serverClient = readSource("src/lib/supabase/server.ts");

  assert.match(serverClient, /import "server-only"/);
  assert.match(serverClient, /createServerClient<Database>/);
  assert.match(serverClient, /await cookies\(\)/);
  assert.match(serverClient, /getAll\(\)/);
  assert.match(serverClient, /setAll\(cookiesToSet\)/);
});

test("profiles migration enforces owner-only RLS", () => {
  const migration = readSource(
    "supabase/migrations/20260811120255_create_profiles.sql",
  );

  assert.match(migration, /create table public\.profiles/);
  assert.match(migration, /references auth\.users\(id\) on delete cascade/);
  assert.match(migration, /alter table public\.profiles enable row level security/);
  assert.match(migration, /revoke all on table public\.profiles from anon/);
  assert.match(migration, /to authenticated/);
  assert.match(migration, /using \(\(select auth\.uid\(\)\) = id\)/);
  assert.match(migration, /with check \(\(select auth\.uid\(\)\) = id\)/);
  assert.doesNotMatch(migration, /auth\.role\(\)/);
  assert.doesNotMatch(migration, /security definer/i);
});

test("database type contract includes the profiles table", () => {
  const types = readSource("src/types/database.ts");

  assert.match(types, /profiles:/);
  assert.match(types, /display_name: string \| null/);
  assert.match(types, /created_at: string/);
  assert.match(types, /updated_at: string/);
});
