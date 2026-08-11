import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("global styles expose the luxury black and gold design contract", () => {
  const styles = readSource("src/app/globals.css");

  assert.match(styles, /--background:\s*#070707/);
  assert.match(styles, /--surface:\s*#0d0d0d/);
  assert.match(styles, /--gold:\s*#c7a55b/);
  assert.match(styles, /--foreground:\s*#f6f1e8/);
  assert.match(styles, /--focus-ring:\s*#d6b86f/);
  assert.match(styles, /--font-arabic:/);
  assert.match(styles, /\.text-mixed\s*\{/);
});

test("design system reference covers the required component patterns", () => {
  const page = readSource("src/app/design-system/page.tsx");

  for (const component of [
    "Button",
    "TextInput",
    "TextArea",
    "DropdownPreview",
    "DialogPreview",
    "ToastPreview",
    "Skeleton",
  ]) {
    assert.match(page, new RegExp(`<${component}`));
  }
});

test("UI primitives preserve visible keyboard focus through the global focus rule", () => {
  const styles = readSource("src/app/globals.css");
  const primitives = readSource("src/components/ui/primitives.tsx");

  assert.match(styles, /:focus-visible\s*\{/);
  assert.match(styles, /outline:\s*2px solid var\(--focus-ring\)/);
  assert.match(primitives, /min-h-11/);
  assert.doesNotMatch(primitives, /focus:outline-none/);
});

test("dropdown preview buttons cannot accidentally submit a containing form", () => {
  const primitives = readSource("src/components/ui/primitives.tsx");
  const optionButtons = primitives.match(/<button type="button"/g) ?? [];

  assert.equal(optionButtons.length, 2);
});

test("global CSS preserves the lint-safe typography values fixed during review", () => {
  const styles = readSource("src/app/globals.css");

  assert.match(
    styles,
    /--font-arabic:\s*"IBM Plex Sans Arabic",\s*"Noto Sans Arabic",\s*"Segoe UI",\s*"Tahoma",\s*"Arial",\s*sans-serif;/,
  );
  assert.match(styles, /--font-latin:\s*"Inter",\s*"Segoe UI",\s*"Arial",\s*sans-serif;/);
  assert.match(styles, /text-rendering:\s*optimizelegibility;/);
});
