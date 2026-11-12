import { defineConfig, devices } from "@playwright/test";
import { E2E_DATA_DIR } from "./tests/e2e/global-setup";
import { CLOSED_SITE, DEMO_HOST } from "./tests/e2e/site-hosts";
import { resolveSupabaseEnv } from "./tests/local-supabase";

// Browser tests against a production build of the app and the local Supabase
// stack (`pnpm db:start && pnpm db:reset`). The build gets the local keys, so
// no .env.local is needed.
const PORT = 3100;
const supabase = resolveSupabaseEnv();
const supabaseEnv = {
  NEXT_PUBLIC_SUPABASE_URL: supabase.url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supabase.anonKey,
  // Matches the local customer-signup and demo-start (supabase/config.toml).
  SIGNUP_PROXY_SECRET: "signup-proxy-local",
};
const portOf = (origin: string) => new URL(origin).port;
// CI runs the browser tests in groups on separate runners
// (.github/workflows/ci-db-web.yml): E2E_ONLY lists the spec files a group
// runs, E2E_SKIP the ones it leaves out (comma separated file names).
const specFiles = (value: string | undefined) =>
  (value ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => `**/${name}`);
const only = specFiles(process.env.E2E_ONLY);
const skip = specFiles(process.env.E2E_SKIP);

export default defineConfig({
  testDir: "tests/e2e",
  ...(only.length > 0 ? { testMatch: only } : {}),
  ...(skip.length > 0 ? { testIgnore: skip } : {}),
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  // A shared CI runner is slow at times (a decision re-renders a whole visit;
  // the first request warms the server): one retry there, reported as flaky.
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Started one after the other: the first one builds, the others start the
  // same build with other flags (tests/e2e/site-hosts.ts).
  webServer: [
    {
      command: `pnpm build && pnpm start --port ${PORT}`,
      url: `http://127.0.0.1:${PORT}/giris`,
      timeout: 240_000,
      reuseExistingServer: !process.env.CI,
      env: {
        ...supabaseEnv,
        // Office tool: synthetic panoramas from the global setup. The local
        // panorama source is development-only; this build allows it explicitly.
        LOCAL_PANORAMA_DIR: `${E2E_DATA_DIR}/runs`,
        LOCAL_PANORAMA_ALLOW_PRODUCTION: "1",
        // Public site and sign-up (İP12): flags on.
        ORCHADOS_SIGNUP_ENABLED: "1",
        ORCHADOS_PAYMENTS_ENABLED: "1",
        PAYMENT_FAKE_CHECKOUT: "1",
        // Demo tour (İP13): this build serves /demo; not a demo host (no
        // ORCHADOS_MAIN_SITE_URL), so the site and the demo run side by side.
        ORCHADOS_DEMO_ENABLED: "1",
        // Map tests (tests/e2e/maps.spec.ts): window.__orchadMaps counts live
        // map instances (src/lib/map/maplibre.ts).
        NEXT_PUBLIC_MAP_TEST_HOOKS: "1",
      },
    },
    {
      // The main site with sign-up closed, linking to the demo host.
      command: `pnpm start --port ${portOf(CLOSED_SITE)}`,
      url: `${CLOSED_SITE}/giris`,
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      env: { ...supabaseEnv, ORCHADOS_DEMO_URL: `${DEMO_HOST}/demo` },
    },
    {
      // A demo deployment whose main site is CLOSED_SITE.
      command: `pnpm start --port ${portOf(DEMO_HOST)}`,
      url: `${DEMO_HOST}/demo`,
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      env: { ...supabaseEnv, ORCHADOS_DEMO_ENABLED: "1", ORCHADOS_MAIN_SITE_URL: CLOSED_SITE },
    },
  ],
});
