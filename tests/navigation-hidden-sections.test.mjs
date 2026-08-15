import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("unfinished admin sections stay hidden and direct placeholder routes do not render roadmap copy", () => {
  const shell = readSource("src/features/admin-shell/admin-shell.tsx");
  const navigation = readSource("src/features/admin-shell/navigation.ts");
  const placeholderRoute = readSource("src/app/admin/[section]/page.tsx");

  for (const label of ["المستخدمون", "المحادثات", "ذاكرة إسلام", "الحالات والأمثلة", "الإعدادات"]) {
    assert.doesNotMatch(shell, new RegExp(label));
  }

  assert.match(shell, /adminNavigation\.map/);
  assert.match(navigation, /href: "\/admin\/knowledge"/);
  assert.match(navigation, /label: "مكتبة المعرفة"/);
  assert.match(placeholderRoute, /import \{ notFound \} from "next\/navigation"/);
  assert.match(placeholderRoute, /notFound\(\)/);
  assert.doesNotMatch(placeholderRoute, /سيتم تنفيذ|مهمة مخصصة|Task\s+\d+/i);
});
