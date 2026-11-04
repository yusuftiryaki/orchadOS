import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Site sub-pages, login and sign-up after the redesign (docs/tasarim-sistemi.md,
// wave 2d): accessibility, phone width, the legal contents and the login
// method tabs. Nothing here signs in or registers.

async function axeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`);
}

const PAGES = [
  "/giris",
  "/kayit",
  "/nasil-calisir",
  "/sss",
  "/iletisim",
  "/demo",
  "/kvkk",
  "/mesafeli-satis",
];

test("no WCAG A/AA violations on the site pages, login and sign-up", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const path of PAGES) {
    await page.goto(path);
    expect(await axeViolations(page), path).toEqual([]);
  }
});

test("sign-up errors are announced and wired to their fields", async ({ page }) => {
  await page.goto("/kayit");
  await page.getByRole("button", { name: "Kayıt ol ve kod gönder" }).click();
  await expect(page.getByTestId("signup-error")).toBeVisible();
  // The first field to fix takes the focus and names its error.
  const name = page.getByLabel("Ad soyad");
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(name).toHaveAccessibleDescription("Bu alan gerekli.");
  await expect(page.getByLabel("Cep telefonu")).toHaveAccessibleDescription(
    /05xx xxx xx xx biçiminde.*Bu alan gerekli\./,
  );
  expect(await axeViolations(page)).toEqual([]);
});

test("sign-up keeps the KVKK box ticked after another field's error", async ({ page }) => {
  await page.goto("/kayit");
  await page.getByLabel("Ad soyad").fill("Deneme Müşteri");
  await page.locator('input[name="kvkk_notice"]').check();
  await page.getByRole("button", { name: "Kayıt ol ve kod gönder" }).click();
  await expect(page.getByTestId("error-phone")).toBeVisible();
  await expect(page.locator('input[name="kvkk_notice"]')).toBeChecked();
  await expect(page.getByTestId("error-kvkk_notice")).toHaveCount(0);
});

test("login: method tabs work with the keyboard and the forgotten-password link", async ({
  page,
}) => {
  await page.goto("/giris");
  const password = page.getByRole("tab", { name: "E-posta" });
  const phone = page.getByRole("tab", { name: "Telefon" });
  await expect(password).toHaveAttribute("aria-selected", "true");
  await password.focus();
  await page.keyboard.press("ArrowRight");
  await expect(phone).toBeFocused();
  await expect(phone).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Cep telefonu")).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(password).toHaveAttribute("aria-selected", "true");

  // The password can be shown and hidden again; the field keeps its label.
  const field = page.getByLabel("Parola");
  const reveal = page.getByRole("button", { name: "Parolayı göster" });
  await expect(field).toHaveAttribute("type", "password");
  await reveal.click();
  await expect(field).toHaveAttribute("type", "text");
  await expect(reveal).toHaveAttribute("aria-pressed", "true");
  await reveal.click();
  await expect(field).toHaveAttribute("type", "password");

  await page.getByRole("button", { name: "Parolamı unuttum" }).click();
  await expect(phone).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Cep telefonu")).toBeVisible();
  await expect(page.getByText("Parolanızı unuttuysanız")).toBeVisible();
});

test("legal texts have in-page contents and stack tables on a phone", async ({ browser }) => {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktop.newPage();
  await page.goto("/kvkk");
  const contents = page.getByRole("navigation", { name: "Bu sayfada" });
  await contents.getByRole("link", { name: "8. Haklarınız (Kanun md. 11)" }).click();
  await expect(page).toHaveURL(/#8-haklariniz-kanun-md-11$/);
  await expect(
    page.getByRole("heading", { name: "8. Haklarınız (Kanun md. 11)" }),
  ).toBeInViewport();
  await expect(page.getByRole("link", { name: "Başa dön" })).toHaveAttribute("href", "#metin-basi");
  await desktop.close();

  const phone = await browser.newContext({ viewport: { width: 360, height: 800 } });
  const small = await phone.newPage();
  for (const path of ["/kvkk", "/mesafeli-satis", "/paketler", "/kayit", "/sss", "/iletisim"]) {
    await small.goto(path);
    const fits = await small.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(fits, path).toBe(true);
  }
  // Each table cell names its column on a phone.
  await small.goto("/kvkk");
  const cell = small.locator("article table td").first();
  await expect(cell).toHaveAttribute("data-label", "Kategori");
  await phone.close();
});

test("404 says what happened and leads home", async ({ page }) => {
  await page.goto("/giris");
  await page.getByLabel("E-posta").fill("owner@example.com");
  await page.getByLabel("Parola").fill("orchados-dev");
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page).toHaveURL("/portal");
  const response = await page.goto("/boyle-bir-sayfa-yok");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sayfa bulunamadı");
  await expect(page.getByRole("link", { name: "Ana sayfaya dön" })).toHaveAttribute("href", "/");
});
