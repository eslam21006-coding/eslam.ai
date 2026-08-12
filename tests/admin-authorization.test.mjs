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

test("a mismatched bootstrap binding fails closed", async () => {
  const deps = dependencies({
    byEmail: { email: "eslam@adscope.net", user_id: null },
    bound: { email: "eslam@adscope.net", user_id: "other-user" },
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

test("server guard uses authentic Auth user data and fails closed around candidate resolution", () => {
  const admin = readSource("src/lib/auth/admin.ts");
  const layout = readSource("src/app/admin/layout.tsx");

  assert.match(admin, /^import "server-only";/);
  assert.match(admin, /supabase\.auth\.getUser\(\)/);
  assert.match(admin, /email_confirmed_at/);
  assert.match(admin, /getSupabaseAdminClient\(\)/);
  assert.match(admin, /from\("admin_users"\)/);
  assert.match(admin, /\.is\("user_id", null\)/);
  assert.match(admin, /let candidate: AdminCandidate \| null;/);
  assert.match(
    admin,
    /candidate = await getCurrentAdminCandidate\(\);[\s\S]*?reportAdminAuthorizationFailure\(error\);[\s\S]*?return false;/,
  );
  assert.match(admin, /redirect\("\/auth\/login"\)/);
  assert.match(admin, /notFound\(\)/);
  assert.doesNotMatch(admin, /user_metadata|raw_user_meta_data/);
  assert.match(layout, /await requireAdmin\(\)/);
});

test("admin role data is private, immutable, and restricted to one-time binding", () => {
  const packageJson = JSON.parse(readSource("package.json"));
  const createMigration = readSource(
    "supabase/migrations/20260811214336_create_admin_users.sql",
  );
  const bindMigration = readSource(
    "supabase/migrations/20260811214459_bind_admin_users_to_auth_users.sql",
  );
  const privilegeMigration = readSource(
    "supabase/migrations/20260811214951_restrict_admin_users_service_privileges.sql",
  );
  const policyMigration = readSource(
    "supabase/migrations/20260811215320_document_admin_users_service_policies.sql",
  );
  const hardeningMigration = readSource(
    "supabase/migrations/20260811220610_harden_admin_user_binding.sql",
  );
  const runtime = readSource("supabase/tests/admin_authorization_runtime.sql");
  const ci = readSource(".github/workflows/ci.yml");

  assert.equal(packageJson.engines.node, ">=22.18.0");
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
  assert.match(policyMigration, /to service_role/);
  assert.match(hardeningMigration, /enforce_admin_user_binding_immutability/);
  assert.match(hardeningMigration, /admin authorization email is immutable/);
  assert.match(hardeningMigration, /admin authorization binding is immutable/);
  assert.match(hardeningMigration, /grant update \(user_id\) on public\.admin_users to service_role/);
  assert.match(hardeningMigration, /using \(user_id is null\)/);
  assert.match(hardeningMigration, /with check \(user_id is not null\)/);
  assert.match(runtime, /grantee in \('PUBLIC', 'anon', 'authenticated'\)/);
  assert.match(runtime, /service_role UPDATE must be limited to admin_users\.user_id/);
  assert.match(runtime, /service_role rebinding unexpectedly succeeded/);
  assert.match(runtime, /admin authorization binding is immutable/);
  assert.match(runtime, /authenticated role unexpectedly read admin_users/);
  assert.match(runtime, /authenticated role unexpectedly mutated admin_users/);
  assert.match(ci, /admin_authorization_runtime\.sql/);
});
