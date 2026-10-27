import { defineConfig, devices } from "@playwright/test";
import { E2E_DATA_DIR } from "./tests/e2e/global-setup";
import { resolveSupabaseEnv } from "./tests/local-supabase";

// Browser tests against a production build of the app and the local Supabase
// stack (`pnpm db:start && pnpm db:reset`). The build gets the local keys, so
// no .env.local is needed.
const PORT = 3100;
const supabase = resolveSupabaseEnv();

export default defineConfig({
  testDir: "tests/e2e",
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
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/giris`,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: supabase.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: supabase.anonKey,
      // Office tool: synthetic panoramas from the global setup. The local
      // panorama source is development-only; this build allows it explicitly.
      LOCAL_PANORAMA_DIR: `${E2E_DATA_DIR}/runs`,
      LOCAL_PANORAMA_ALLOW_PRODUCTION: "1",
      // Public site and sign-up (İP12): flags on; the secret matches the local
      // customer-signup function (supabase/config.toml).
      ORCHADOS_SIGNUP_ENABLED: "1",
      ORCHADOS_PAYMENTS_ENABLED: "1",
      PAYMENT_FAKE_CHECKOUT: "1",
      SIGNUP_PROXY_SECRET: "signup-proxy-local",
    },
  },
});
