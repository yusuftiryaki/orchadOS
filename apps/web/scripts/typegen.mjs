// Generates src/lib/database.types.ts from the local Supabase database.
// Writes the file only when generation succeeds, so a stopped database
// never leaves an empty types file behind.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { format, resolveConfig } from "prettier";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(here, "..");
const repoRoot = resolve(appDir, "../..");
const target = resolve(appDir, "src/lib/database.types.ts");

const output = execFileSync(
  "supabase",
  ["gen", "types", "typescript", "--local", "--workdir", repoRoot, "--schema", "public"],
  { cwd: appDir, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
);

if (!output.includes("export type Database")) {
  console.error("typegen: unexpected output, not writing", target);
  process.exit(1);
}
// The CLI output is unformatted; format it so regenerations give readable diffs.
const options = (await resolveConfig(target)) ?? {};
writeFileSync(target, await format(output, { ...options, filepath: target }));
console.log("typegen: wrote", target);
