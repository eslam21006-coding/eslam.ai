import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  normalizeAdminEmail,
  resolveAdminAuthorization,
} from "../src/lib/auth/admin-core.ts";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

function dependencies({ byUserId = null, byEmail = null, bound = null } = {}) {
  const calls = [];

  return {
    calls,
    value: {
      findByUserId: async (userId) => {
        calls.push(["findByUserId", userId]);
        return byUserId;
      },
      findByEmail: async (email) => {
        calls.push(["findByEmail", email]);
        return byEmail;
      },
      bindUser: async (email, userId) => {
        calls.push(["bindUser", email, userId]);
        return bound;
      },
    },
  };
}

test("bound admin authorization is anchored to the Supabase Auth user id", async () => {
  const deps = dependencies({
    byUserId: { email: "eslam@adscope.net", user_id: "admin-user" },
  });

  const result = await resolveAdminAuthorization(
    {
      id: "admin-user",
      email: "changed@example.com",
      emailConfirmedAt: null,
    },
    deps.value,
  );

  assert.deepEqual(result, {
    authorized: true,
    userId: "admin-user",
    email: "eslam@adscope.net",
  });
  assert.deepEqual(deps.calls, [["findByUserId", "admin-user"]]);
});

test("confirmed pre-authorized email bootstraps once and binds the user id", async () => {
  const deps = dependencies({
    byEmail: { email: "eslam@adscope.net", user_id: null },
    bound: { email: "eslam@adscope.net", user_id: "new-admin-user" },
  });

  const result = await resolveAdminAuthorization(
    {
      id: "new-admin-user",
      email: "  ESLAM@ADSCOPE.NET ",
      emailConfirmedAt: "2026-08-12T00:00:00.000Z",
    },
    deps.value,
  );

  assert.equal(normalizeAdminEmail("  ESLAM@ADSCOPE.NET "), "eslam@adscope.net");
  assert.deepEqual(result, {
    authorized: true,
    userId: "new-admin-user",
    email: "eslam@adscope.net",
  });
  assert.deepEqual(deps.calls, [
    ["findByUserId", "new-admin-user"],
    ["findByEmail", "eslam@adscope.net"],
    ["bindUser", "eslam@adscope.net", "new-admin-user"],
  ]);
});

test("unconfirmed or unrelated identities cannot bootstrap admin access", async () => {
  const unconfirmed = dependencies({
    byEmail: { email: "eslam@adscope.net", user_id: null },
  });
  const unconfirmedResult = await resolveAdminAuthorization(
    {
      id: "candidate",
      email: "eslam@adscope.net",
      emailConfirmedAt: null,
    },
    unconfirmed.value,
  );

  assert.deepEqual(unconfirmedResult, { authorized: false });
  assert.deepEqual(unconfirmed.calls, [["findByUserId", "candidate"]]);

  const unrelated = dependencies();
  const unrelatedResult = await resolveAdminAuthorization(
    {
      id: "other-user",
      email: "other@example.com",
      emailConfirmedAt: "2026-08-12T00:00:00.000Z",
    },
    unrelated.value,
  );

  assert.deepEqual(unrelatedResult, { authorized: false });
  assert.deepEqual(unrelated.calls, [
    ["findByUserId", "other-user"],
    ["findByEmail", "other@example.com"],
  ]);
});

test("a lost bootstrap race fails closed", async () => {
  const deps = dependencies({
    byEmail: { email: "eslam@adscope.net", user_id: null },
    bound: null,
  });

  const result = await resolveAdminAuthorization(
    {
      id: "candidate",
      email: "eslam@adscope.net",
      emailConfirmedAt: "2026-08-12T00:00:00.000Z",
    },
    deps.value,
  );

  assert.deepEqual(result, { authorized: false });
});

test("server guard uses authentic Auth user data and a backend-only role lookup", () => {
  const admin = readSource("src/lib/auth/admin.ts");
  const layout = readSource("src/app/admin/layout.tsx");

  assert.match(admin, /^import "server-only";/);
  assert.match(admin, /supabase\.auth\.getUser\(\)/);
  assert.match(admin, /email_confirmed_at/);
  assert.match(admin, /getSupabaseAdminClient\(\)/);
  assert.match(admin, /from\("admin_users"\)/);
  assert.match(admin, /\.is\("user_id", null\)/);
  assert.match(admin, /redirect\("\/auth\/login"\)/);
  assert.match(admin, /notFound\(\)/);
  assert.doesNotMatch(admin, /user_metadata|raw_user_meta_data/);
  assert.match(layout, /await requireAdmin\(\)/);
});

test("admin role data is private to server credentials and pre-authorizes the primary email", () => {
  const createMigration = readSource(
    "supabase/migrations/20260811214336_create_admin_users.sql",
  );
  const bindMigration = readSource(
    "supabase/migrations/20260811214459_bind_admin_users_to_auth_users.sql",
  );
  const privilegeMigration = readSource(
    "supabase/migrations/20260811214951_restrict_admin_users_service_privileges.sql",
  );
  const runtime = readSource("supabase/tests/admin_authorization_runtime.sql");
  const ci = readSource(".github/workflows/ci.yml");

  assert.match(createMigration, /alter table public\.admin_users enable row level security/);
  assert.match(
    createMigration,
    /revoke all on table public\.admin_users from public, anon, authenticated/,
  );
  assert.match(createMigration, /'eslam@adscope\.net'/);
  assert.match(bindMigration, /user_id uuid unique references auth\.users\(id\) on delete cascade/);
  assert.match(
    privilegeMigration,
    /revoke all on table public\.admin_users from service_role/,
  );
  assert.match(
    privilegeMigration,
    /grant select, update on table public\.admin_users to service_role/,
  );
  assert.doesNotMatch(privilegeMigration, /grant[^;]*(insert|delete|truncate|trigger)/i);
  assert.match(runtime, /authenticated role unexpectedly read admin_users/);
  assert.match(runtime, /authenticated role unexpectedly mutated admin_users/);
  assert.match(runtime, /service_role has unnecessary admin_users privileges/);
  assert.match(runtime, /service_role could not bind primary admin to auth user/);
  assert.match(ci, /admin_authorization_runtime\.sql/);
});
