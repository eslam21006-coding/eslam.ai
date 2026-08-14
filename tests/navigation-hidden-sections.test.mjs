import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("role-aware navigation keeps future admin sections hidden from active UI", () => {
  const navigation = readSource("src/features/admin-shell/navigation.ts");
  const shell = readSource("src/features/admin-shell/admin-shell.tsx");

  for (const label of ["المستخدمون", "المحادثات", "ذاكرة إسلام", "معرفة إسلام", "الحالات والأمثلة", "الإعدادات"]) {
    assert.match(navigation, new RegExp(label));
    assert.doesNotMatch(shell, new RegExp(label));
  }

  assert.match(navigation, /futureAdminSections/);
  assert.match(shell, /adminNavigation\.map/);
});
