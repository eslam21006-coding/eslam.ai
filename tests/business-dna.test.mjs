import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

const migration = readSource(
  "supabase/migrations/20260811130752_create_business_dna.sql",
);
const lengthMigration = readSource(
  "supabase/migrations/20260811133112_constrain_business_dna_text_length.sql",
);
const privilegeMigration = readSource(
  "supabase/migrations/20260811133756_restrict_business_dna_table_privileges.sql",
);

const businessDnaFields = [
  "preferred_name",
  "business_name",
  "niche",
  "markets",
  "audiences",
  "business_model",
  "offers",
  "price_ranges",
  "positioning",
  "methodology",
  "delivery",
  "team_context",
];

test("Business DNA schema contains only slow-changing business context", () => {
  const createTable = migration.match(
    /create table public\.business_dna \(([\s\S]*?)\n\);/,
  )?.[1];

  assert.ok(createTable, "business_dna table definition should exist");

  for (const field of businessDnaFields) {
    assert.match(createTable, new RegExp(`\\b${field}\\b`));
  }

  for (const mutableMetric of [
    "cpl",
    "cpa",
    "spend",
    "revenue",
    "conversion",
    "registrations",
    "attendance",
    "booked_calls",
    "close_rate",
  ]) {
    assert.doesNotMatch(createTable, new RegExp(`\\b${mutableMetric}\\b`, "i"));
  }
});

test("Business DNA RLS binds every operation to the authenticated owner", () => {
  assert.match(migration, /alter table public\.business_dna enable row level security/);
  assert.match(
    migration,
    /create policy "Users can read their own Business DNA"[\s\S]*?for select[\s\S]*?to authenticated[\s\S]*?using \(\(select auth\.uid\(\)\) = user_id\);/,
  );
  assert.match(
    migration,
    /create policy "Users can create their own Business DNA"[\s\S]*?for insert[\s\S]*?to authenticated[\s\S]*?with check \(\(select auth\.uid\(\)\) = user_id\);/,
  );
  assert.match(
    migration,
    /create policy "Users can update their own Business DNA"[\s\S]*?for update[\s\S]*?to authenticated[\s\S]*?using \(\(select auth\.uid\(\)\) = user_id\)[\s\S]*?with check \(\(select auth\.uid\(\)\) = user_id\);/,
  );
  assert.doesNotMatch(migration, /security definer/i);
});

test("Business DNA final grants expose only select insert and update", () => {
  assert.match(
    privilegeMigration,
    /revoke all on table public\.business_dna from anon, authenticated;/,
  );
  assert.match(
    privilegeMigration,
    /grant select, insert, update on table public\.business_dna to authenticated;/,
  );
  assert.doesNotMatch(privilegeMigration, /grant[^;]*delete/i);
});

test("Business DNA keeps timestamps current on update", () => {
  assert.match(migration, /create trigger set_business_dna_updated_at/);
  assert.match(migration, /before update on public\.business_dna/);
  assert.match(migration, /new\.updated_at = now\(\)/);
});

test("Business DNA length limits are enforced in Postgres as well as the form", () => {
  for (const field of businessDnaFields) {
    assert.match(
      lengthMigration,
      new RegExp(
        `add constraint business_dna_${field}_length check \\(${field} is null or char_length\\(${field}\\) <= 4000\\)`,
      ),
    );
  }
});

test("one shared module owns the Business DNA field contract", () => {
  const fields = readSource("src/features/business-dna/fields.ts");
  const actions = readSource("src/features/business-dna/actions.ts");
  const page = readSource("src/app/app/business/page.tsx");
  const form = readSource("src/features/business-dna/business-dna-form.tsx");

  for (const field of businessDnaFields) {
    assert.match(fields, new RegExp(`name: ["']${field}["']`));
  }
  assert.match(fields, /MAX_FIELD_LENGTH = 4000/);
  assert.match(fields, /BUSINESS_DNA_SELECT = businessDnaFieldNames\.join/);
  assert.match(actions, /businessDnaFieldNames/);
  assert.match(page, /\.select\(BUSINESS_DNA_SELECT\)/);
  assert.match(form, /businessDnaFieldDefinitions\.map/);
  assert.match(form, /maxLength=\{MAX_FIELD_LENGTH\}/);
});

test("save action derives ownership from auth and preserves failed submissions", () => {
  const actions = readSource("src/features/business-dna/actions.ts");

  assert.match(actions, /requireAuthenticatedUser\(\)/);
  assert.match(actions, /user_id: userId/);
  assert.match(actions, /onConflict: "user_id"/);
  assert.doesNotMatch(actions, /formData\.get\(["']user_id["']\)/);
  assert.match(actions, /return failureState\("invalid_input"\)/);
  assert.match(actions, /return failureState\("save_failed"\)/);
  assert.match(actions, /console\.error\("business_dna upsert failed"/);
  assert.match(actions, /redirect\("\/app\/business\?status=saved"\)/);
  assert.doesNotMatch(actions, /redirect\("\/app\/business\?error=/);
});

test("Business DNA form keeps returned values and exposes pending state", () => {
  const form = readSource("src/features/business-dna/business-dna-form.tsx");
  const button = readSource("src/features/business-dna/submit-button.tsx");

  assert.match(form, /useActionState\(saveBusinessDnaAction, initialState\)/);
  assert.match(form, /defaultValue=\{state\.values\[field\.name\]\}/);
  assert.match(form, /احتفظنا بتعديلاتك/);
  assert.match(button, /useFormStatus\(\)/);
  assert.match(button, /disabled=\{pending\}/);
  assert.match(button, /aria-disabled=\{pending\}/);
  assert.match(button, /جارٍ الحفظ/);
});

test("Business DNA page loads only the owner-scoped record", () => {
  const page = readSource("src/app/app/business/page.tsx");

  assert.match(page, /requireAuthenticatedUser\(\)/);
  assert.match(page, /from\("business_dna"\)/);
  assert.match(page, /\.eq\("user_id", userId\)/);
  assert.match(page, /businessDnaValuesFromRow/);
  assert.match(page, /<BusinessDnaForm/);
});

test("runtime tenant-isolation SQL exercises read update and insert enforcement", () => {
  const runtime = readSource("supabase/tests/business_dna_rls_runtime.sql");
  const ci = readSource(".github/workflows/ci.yml");

  assert.match(runtime, /set local role authenticated/);
  assert.match(runtime, /request\.jwt\.claims/);
  assert.match(runtime, /RLS leak: user B can read user A Business DNA/);
  assert.match(runtime, /get diagnostics updated_count = row_count/);
  assert.match(runtime, /when insufficient_privilege/);
  assert.match(runtime, /rollback;/);
  assert.match(ci, /business_dna_rls_runtime\.sql/);
});

test("generated database types include Business DNA", () => {
  const types = readSource("src/types/database.ts");

  assert.match(types, /business_dna:/);
  assert.match(types, /user_id: string/);
  assert.match(types, /preferred_name: string \| null/);
  assert.match(types, /team_context: string \| null/);
});
