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
  assert.match(migration, /revoke all on table public\.business_dna from anon/);
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

test("save action derives ownership from auth rather than form input", () => {
  const actions = readSource("src/features/business-dna/actions.ts");

  assert.match(actions, /requireAuthenticatedUser\(\)/);
  assert.match(actions, /user_id: userId/);
  assert.match(actions, /from\("business_dna"\)\.upsert/);
  assert.match(actions, /onConflict: "user_id"/);
  assert.doesNotMatch(actions, /formData\.get\(["']user_id["']\)/);
  assert.match(actions, /MAX_FIELD_LENGTH = 4000/);
});

test("Business DNA page loads and edits the owner-scoped record", () => {
  const page = readSource("src/app/app/business/page.tsx");

  assert.match(page, /requireAuthenticatedUser\(\)/);
  assert.match(page, /from\("business_dna"\)/);
  assert.match(page, /\.eq\("user_id", userId\)/);
  assert.match(page, /action=\{saveBusinessDnaAction\}/);
  assert.match(page, /name=\{field\.name\}/);
  assert.match(page, /حفظ الملف التجاري/);
});

test("generated database types include Business DNA", () => {
  const types = readSource("src/types/database.ts");

  assert.match(types, /business_dna:/);
  assert.match(types, /user_id: string/);
  assert.match(types, /preferred_name: string \| null/);
  assert.match(types, /team_context: string \| null/);
});
