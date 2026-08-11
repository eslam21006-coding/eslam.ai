import { existsSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const mode = process.argv[2];

if (mode !== "--local" && mode !== "--linked") {
  console.error("Usage: node scripts/generate-database-types.mjs --local|--linked");
  process.exit(2);
}

const outputPath = resolve("src/types/database.ts");
const temporaryPath = `${outputPath}.tmp`;
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const result = spawnSync(
  npmCommand,
  ["exec", "--", "supabase", "gen", "types", "typescript", mode],
  {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  },
);

try {
  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  if (!result.stdout.trim()) {
    throw new Error("Supabase type generation returned empty output.");
  }

  writeFileSync(temporaryPath, result.stdout, "utf8");
  renameSync(temporaryPath, outputPath);
} finally {
  if (existsSync(temporaryPath)) {
    rmSync(temporaryPath);
  }
}
