import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

// Synthetic panoramas for the office tool test (services/pipeline synth + run).
// Reused across runs; needs uv. Without it the office test is skipped.
export const E2E_DATA_DIR = resolve(import.meta.dirname, "../../.dev-data/e2e");

// Set when the demo tour dataset is loaded; demo-tour.spec.ts runs only then.
export const DEMO_TOUR_READY = "ORCHADOS_E2E_DEMO_TOUR";

const REPO_ROOT = resolve(import.meta.dirname, "../../../..");

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

  // The demo tour dataset (docs/demo-turu.md §10), small test profile, on the
  // freshly reset local database. Locally without uv the demo test is
  // skipped; in CI a failure stops the run.
  try {
    execFileSync("pnpm", ["db:demo-tour", "--profile", "test", "--reset-local"], {
      cwd: REPO_ROOT,
      stdio: "inherit",
    });
    process.env[DEMO_TOUR_READY] = "1";
  } catch (error) {
    if (process.env.CI) throw error;
    console.warn("demo tour dataset could not be loaded; demo-tour.spec.ts will be skipped", error);
  }
}
