import { expect, test, type Page } from "@playwright/test";

// The back office screens (IP12-E) are ops only: owner@ and expert@ get 403
// on each of them, as on the other operations screens.

const PASSWORD = "orchados-dev";
const ANY = "91200000-0000-4000-8000-000000000301";
const PATHS = [
  "/operasyon/basvuru",
  `/operasyon/basvuru/${ANY}`,
  `/operasyon/basvuru/${ANY}/bahce/91200000-0000-4000-8000-000000000401`,
  "/operasyon/teklif/yeni?sahip=" + ANY,
  `/operasyon/teklif/${ANY}`,
  "/operasyon/siparis",
  `/operasyon/siparis/${ANY}`,
  "/operasyon/odeme",
  `/operasyon/odeme/${ANY}`,
  "/operasyon/iade",
  "/operasyon/fiyat",
  "/operasyon/fiyat/paket/yeni",
  "/operasyon/fiyat/liste/91200000-0000-4000-8000-000000000101",
  "/operasyon/denetim-kaydi",
  "/operasyon/ayarlar",
];

async function login(page: Page, email: string, next: string) {
  await page.goto(`/giris?next=${encodeURIComponent(next)}`);
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Parola").fill(PASSWORD);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await page.waitForURL((url) => url.pathname === next);
}

for (const [email, home] of [
  ["owner@example.com", "/portal"],
  ["expert@example.com", "/uzman"],
] as const) {
  test(`${email} gets 403 on the back office screens`, async ({ page }) => {
    await login(page, email, home);
    for (const path of PATHS) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(403);
    }
  });
}
