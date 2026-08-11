import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

const extractPolicy = (migration, policyName) => {
  const escapedName = policyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = migration.match(
    new RegExp(`create policy "${escapedName}"[\\s\\S]*?;`, "i"),
  );

  assert.ok(match, `policy ${policyName} should exist`);
  return match[0];
};

test("Supabase packages are pinned, locked, and use the supported Node runtime", () => {
  const pkg = JSON.parse(readSource("package.json"));
  const lock = JSON.parse(readSource("package-lock.json"));
  const rootLock = lock.packages[""];

  assert.equal(pkg.engines.node, ">=22.0.0");
  assert.equal(pkg.dependencies["@supabase/ssr"], "0.12.4");
  assert.equal(pkg.dependencies["@supabase/supabase-js"], "2.111.0");
  assert.equal(pkg.devDependencies.supabase, "2.110.0");

  assert.equal(rootLock.dependencies["@supabase/ssr"], pkg.dependencies["@supabase/ssr"]);
  assert.equal(
    rootLock.dependencies["@supabase/supabase-js"],
    pkg.dependencies["@supabase/supabase-js"],
  );
  assert.equal(rootLock.devDependencies.supabase, pkg.devDependencies.supabase);
});

test("database type generation replaces committed types only after success", () => {
  const pkg = JSON.parse(readSource("package.json"));
  const generator = readSource("scripts/generate-database-types.mjs");

  assert.equal(
    pkg.scripts["db:types:local"],
    "node scripts/generate-database-types.mjs --local",
  );
  assert.equal(
    pkg.scripts["db:types:linked"],
    "node scripts/generate-database-types.mjs --linked",
  );
  assert.match(generator, /temporaryPath/);
  assert.match(generator, /result\.status !== 0/);
  assert.match(generator, /writeFileSync\(temporaryPath/);
  assert.match(generator, /renameSync\(temporaryPath, outputPath\)/);
});

test("public Supabase env contract never exposes privileged credentials", () => {
  const envExample = readSource(".env.example");
  const envModule = readSource("src/lib/supabase/env.ts");
  const browserClient = readSource("src/lib/supabase/client.ts");
  const publicVars = [
    ...envModule.matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g),
  ].map(([name]) => name);

  assert.deepEqual(
    [...new Set(publicVars)].sort(),
    ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_URL"].sort(),
  );
  assert.match(envExample, /NEXT_PUBLIC_SUPABASE_URL=/);
  assert.match(envExample, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=/);
  assert.doesNotMatch(envExample, /NEXT_PUBLIC_.*(?:SERVICE_ROLE|SECRET_KEY)/i);
  assert.doesNotMatch(envModule, /service[_-]?role|secret[_-]?key/i);
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

test("profiles migration enforces owner-only RLS per operation", () => {
  const migration = readSource(
    "supabase/migrations/20260811120255_create_profiles.sql",
  );
  const selectPolicy = extractPolicy(migration, "Users can read their own profile");
  const insertPolicy = extractPolicy(migration, "Users can create their own profile");
  const updatePolicy = extractPolicy(migration, "Users can update their own profile");

  assert.match(migration, /create table public\.profiles/);
  assert.match(migration, /references auth\.users\(id\) on delete cascade/);
  assert.match(migration, /alter table public\.profiles enable row level security/);
  assert.match(migration, /revoke all on table public\.profiles from anon/);
  assert.equal((migration.match(/create policy /gi) ?? []).length, 3);

  assert.match(selectPolicy, /for select[\s\S]*?to authenticated/i);
  assert.match(selectPolicy, /using \(\(select auth\.uid\(\)\) = id\)/i);

  assert.match(insertPolicy, /for insert[\s\S]*?to authenticated/i);
  assert.match(insertPolicy, /with check \(\(select auth\.uid\(\)\) = id\)/i);

  assert.match(updatePolicy, /for update[\s\S]*?to authenticated/i);
  assert.match(updatePolicy, /using \(\(select auth\.uid\(\)\) = id\)/i);
  assert.match(updatePolicy, /with check \(\(select auth\.uid\(\)\) = id\)/i);

  assert.doesNotMatch(migration, /auth\.role\(\)/);
  assert.doesNotMatch(migration, /security definer/i);
});

test("profiles migration maintains updated_at on every update", () => {
  const migration = readSource(
    "supabase/migrations/20260811120255_create_profiles.sql",
  );

  assert.match(migration, /create function public\.set_profiles_updated_at\(\)/i);
  assert.match(migration, /new\.updated_at = now\(\)/i);
  assert.match(migration, /before update on public\.profiles/i);
  assert.match(migration, /execute function public\.set_profiles_updated_at\(\)/i);
  assert.match(
    migration,
    /revoke all on function public\.set_profiles_updated_at\(\) from public, anon, authenticated/i,
  );
});

test("database type contract includes the profiles table", () => {
  const types = readSource("src/types/database.ts");

  assert.match(types, /profiles:/);
  assert.match(types, /display_name: string \| null/);
  assert.match(types, /created_at: string/);
  assert.match(types, /updated_at: string/);
});
