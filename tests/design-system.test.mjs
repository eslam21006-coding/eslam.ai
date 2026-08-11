import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const readSource = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

const extractExportedFunction = (source, functionName) => {
  const marker = `export function ${functionName}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `${functionName} should exist`);

  const next = source.indexOf("\nexport function ", start + marker.length);
  return source.slice(start, next === -1 ? undefined : next);
};

const parseHex = (hex) => {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
};

const relativeLuminance = (hex) => {
  const [red, green, blue] = parseHex(hex).map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

const contrastRatio = (foreground, background) => {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
};

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

test("subtle foreground maintains readable contrast on subtle surfaces", () => {
  const styles = readSource("src/app/globals.css");
  const foreground = styles.match(/--foreground-subtle:\s*(#[0-9a-f]{6})/i)?.[1];
  const background = styles.match(/--surface-subtle:\s*(#[0-9a-f]{6})/i)?.[1];

  assert.ok(foreground, "--foreground-subtle should be a hex color");
  assert.ok(background, "--surface-subtle should be a hex color");
  assert.ok(
    contrastRatio(foreground, background) >= 4.5,
    "subtle foreground should meet the 4.5:1 normal-text contrast threshold",
  );
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

test("text controls preserve visible keyboard focus and minimum control sizing", () => {
  const styles = readSource("src/app/globals.css");
  const primitives = readSource("src/components/ui/primitives.tsx");
  const input = extractExportedFunction(primitives, "TextInput");
  const textarea = extractExportedFunction(primitives, "TextArea");

  assert.match(styles, /:focus-visible\s*\{/);
  assert.match(styles, /outline:\s*2px solid var\(--focus-ring\)/);

  assert.match(input, /min-h-11/);
  assert.doesNotMatch(input, /focus:outline-none/);
  assert.doesNotMatch(textarea, /focus:outline-none/);
});

test("dropdown preview options are non-submitting and meet the minimum hit target", () => {
  const primitives = readSource("src/components/ui/primitives.tsx");
  const dropdown = extractExportedFunction(primitives, "DropdownPreview");
  const optionButtons = [...dropdown.matchAll(/<button type="button" className="([^"]+)"/g)];

  assert.equal(optionButtons.length, 2);
  for (const [, classes] of optionButtons) {
    assert.match(classes, /(?:^|\s)min-h-11(?:\s|$)/);
  }
});
