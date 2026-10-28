import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The landing page (docs/tasarim-sistemi.md): what an audit tells the owner,
// sign-up and the demo tour. The build runs with sign-up and the demo on
// (playwright.config.ts).

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

test("renders the orchard sample, the classes and the packages without console errors", async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Bahçenize gitmeden, ağaç ağaç görün.",
  );
  await expect(page.getByRole("img", { name: "Örnek bahçe, kış ziyareti" })).toBeVisible();
  const classes = page.getByRole("list", { name: "Ağaç sınıfları" });
  await expect(classes.getByRole("listitem")).toHaveCount(5);
  await expect(classes).toContainText("Sağlıklı");
  await expect(classes).toContainText("Dikkat");
  // Published seed list (docs/fiyatlandirma.md): Standart is 864 ₺ a dönüm
  // and year with VAT, the same figure as /paketler.
  await expect(page.getByTestId("landing-package")).toHaveCount(3);
  await expect(page.getByTestId("landing-package").filter({ hasText: "Standart" })).toContainText(
    "₺864",
  );
  expect(errors).toEqual([]);
});

test("the main calls to action lead to sign-up and to the demo tour", async ({ page }) => {
  await page.goto("/");
  const hero = page.locator("section").first();
  await hero.getByRole("link", { name: "Kayıt olun" }).click();
  await expect(page).toHaveURL("/kayit");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Kayıt ol");

  await page.goto("/");
  await page.getByTestId("landing-demo").click();
  await expect(page).toHaveURL("/demo");
  await expect(page.getByTestId("demo-start")).toBeVisible();

  await page.goto("/");
  await page.getByTestId("landing-demo-foot").click();
  await expect(page).toHaveURL("/demo");
});

test.describe("phone", () => {
  test.use({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });

  test("the menu opens, leads to a page and closes; Escape closes it too", async ({ page }) => {
    await page.goto("/");
    const header = page.locator("header").first();
    // The page links live in the menu on a phone.
    await expect(header.getByRole("link", { name: "Paketler", exact: true })).toBeHidden();
    const menu = header.getByRole("button", { name: "Menü" });
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await menu.click();
    await expect(header.getByRole("button", { name: "Kapat" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await header.getByRole("link", { name: "Paketler", exact: true }).click();
    await expect(page).toHaveURL("/paketler");
    await expect(header.getByRole("button", { name: "Menü" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    await header.getByRole("button", { name: "Menü" }).click();
    await expect(header.getByRole("link", { name: "Giriş", exact: true })).toBeVisible();
    await expect(header.getByRole("link", { name: "Demoyu dene" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(header.getByRole("link", { name: "Giriş", exact: true })).toBeHidden();
    await expect(header.getByRole("button", { name: "Menü" })).toBeFocused();
  });

  test("sign-up stays on the bar and the page fits", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("header-signup")).toBeVisible();
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(fits).toBe(true);
  });
});

test("keyboard: the first tab stop shows a focus ring", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    return getComputedStyle(el).outlineStyle;
  });
  expect(outline).not.toBe("none");
});

test("no WCAG A/AA violations on the landing page and the shared site chrome", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const path of ["/", "/paketler"]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(
      results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`),
      path,
    ).toEqual([]);
  }
});
