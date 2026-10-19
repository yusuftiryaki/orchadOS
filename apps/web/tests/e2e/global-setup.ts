import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

// Synthetic panoramas for the office tool test (services/pipeline synth + run).
// Reused across runs; needs uv. Without it the office test is skipped.
export const E2E_DATA_DIR = resolve(import.meta.dirname, "../../.dev-data/e2e");

export default function globalSetup() {
  try {
    execFileSync(
      "node",
      [
        resolve(import.meta.dirname, "../../scripts/office-dev-data.mjs"),
        "--skip-db",
        "--out",
        E2E_DATA_DIR,
      ],
      { stdio: "inherit" },
    );
  } catch (error) {
    console.warn("office tool test data could not be generated; that test will be skipped", error);
  }
}
