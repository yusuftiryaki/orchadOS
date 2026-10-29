import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";
import { resolveSupabaseEnv } from "./tests/local-supabase";

// Screenshots for the staff guide (docs/kilavuz/). Not part of `pnpm web:e2e`
// (that config reads tests/e2e only). Needs the local stack with the seed and
// the demo scans (`pnpm db:start && pnpm db:reset && pnpm db:demo`); the specs
// add their own synthetic rows. Run with `pnpm kilavuz:screens` at the repo root.
const PORT = 3300;
const supabase = resolveSupabaseEnv();

export const OFFICE_DATA_DIR = resolve(import.meta.dirname, ".dev-data/office");

export default defineConfig({
  testDir: "tests/kilavuz",
  globalSetup: "./tests/kilavuz/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1280, height: 800 },
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        // Date inputs follow the browser process's language (LANG), not the
        // page locale: gg.aa.yyyy as on a Turkish computer.
        launchOptions: {
          args: ["--lang=tr-TR"],
          env: { ...process.env, LANG: "tr_TR.UTF-8", LANGUAGE: "tr" },
        },
      },
    },
  ],
  webServer: {
    // A production build: no development overlay or indicator in the shots.
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/giris`,
    timeout: 300_000,
    reuseExistingServer: true,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: supabase.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: supabase.anonKey,
      SIGNUP_PROXY_SECRET: "signup-proxy-local",
      LOCAL_PANORAMA_DIR: `${OFFICE_DATA_DIR}/runs`,
      LOCAL_PANORAMA_ALLOW_PRODUCTION: "1",
      ORCHADOS_SIGNUP_ENABLED: "1",
      ORCHADOS_PAYMENTS_ENABLED: "1",
      PAYMENT_FAKE_CHECKOUT: "1",
      NEXT_PUBLIC_MAP_TEST_HOOKS: "1",
      // The production build reads basemap tiles through its own proxy, which
      // names a contact upstream (OSM tile policy). Behind an HTTPS proxy also
      // set NODE_USE_ENV_PROXY=1 (Node 22.21+) so the server's fetch uses it.
      MAP_TILE_CONTACT: process.env.MAP_TILE_CONTACT ?? "https://github.com/yusuftiryaki/orchadOS",
    },
  },
});
