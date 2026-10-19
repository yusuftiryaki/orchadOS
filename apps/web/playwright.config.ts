import { defineConfig, devices } from "@playwright/test";
import { resolveSupabaseEnv } from "./tests/local-supabase";

// Browser tests against a production build of the app and the local Supabase
// stack (`pnpm db:start && pnpm db:reset`). The build gets the local keys, so
// no .env.local is needed.
const PORT = 3100;
const supabase = resolveSupabaseEnv();

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
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
    },
  },
});
