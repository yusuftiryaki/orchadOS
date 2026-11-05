import { expect, test } from "@playwright/test";
import { login, PASSWORD, PHONE, shot } from "./helpers";

// Chapter 01: sign-in, the sections of each role, the "no access" page.

test("giriş ekranı", async ({ page }) => {
  await page.goto("/giris");
  await expect(page.getByRole("button", { name: "Giriş yap" })).toBeVisible();
  await page.getByLabel("E-posta").fill("ops@example.com");
  await shot(page, "giris/01-giris.png", [
    { target: page.getByRole("tab", { name: "E-posta" }), n: 1 },
    { target: page.getByLabel("E-posta"), n: 2 },
    { target: page.getByLabel("Parola"), n: 3 },
    { target: page.getByRole("button", { name: "Parolamı unuttum" }), n: 4 },
    { target: page.getByRole("button", { name: "Giriş yap" }), n: 5 },
  ]);
});

test("giriş ekranı, telefonda ve hatalı parola", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto("/giris");
  await page.getByLabel("E-posta").fill("ops@example.com");
  await page.getByLabel("Parola").fill("yanlis-parola");
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page.getByText("E-posta ya da parola hatalı")).toBeVisible();
  await shot(page, "giris/02-giris-hatali-telefon.png");
});

test("operasyon girişi: bölümler", async ({ page }) => {
  // Without ?next= the app opens the first section the role may use.
  await page.goto("/giris");
  await page.getByLabel("E-posta").fill("ops@example.com");
  await page.getByLabel("Parola").fill(PASSWORD);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await page.waitForURL((url) => url.pathname !== "/giris");
  const sections = page.getByRole("navigation", { name: "Bölümler" });
  await expect(sections).toBeVisible();
  await shot(page, "giris/03-ilk-ekran-ofis.png", [
    { target: sections.getByRole("link", { name: "Ofis" }), n: 1, at: "below" },
    { target: sections.getByRole("link", { name: "Operasyon" }), n: 2, at: "below" },
    { target: page.getByRole("button", { name: "Çıkış" }), n: 3, at: "below" },
  ]);
});

test("yetkisiz bölüm", async ({ page }) => {
  await login(page, "field@example.com", "/ofis");
  await page.goto("/operasyon");
  await expect(page.getByRole("heading", { name: "Bu bölüme erişiminiz yok" })).toBeVisible();
  await shot(page, "giris/04-erisim-yok.png");
});
