import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { anon, login, PASSWORD, quotedApplication } from "./billing-helpers";

// The customer's billing pages (docs/tasarim-sistemi.md, wave 2a) have no
// WCAG A/AA violations and no horizontal scroll on a phone: the applications,
// the seeded application under review, a quote and the order made from it.
// The order is cancelled at the end, so customer@example.com keeps no open
// order.

const EMAIL = "customer@example.com";
const SEED_APPLICATION = "91200000-0000-4000-8000-000000000301";
const CONSENTS = { distance_sales: "mesafeli-v5-taslak", pre_information: "onbilgi-v5-taslak" };

test.describe.configure({ mode: "serial" });

async function expectAccessible(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`),
    path,
  ).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${path}: horizontal scroll`).toBeLessThanOrEqual(0);
}

for (const width of [390, 1440]) {
  test(`billing pages are accessible at ${width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await login(page, EMAIL, "/portal/basvuru");
    await expectAccessible(page, "/portal/basvuru");
    await expectAccessible(page, `/portal/basvuru/${SEED_APPLICATION}`);
    await expectAccessible(page, "/portal/siparis");
    await expectAccessible(page, "/portal/odeme");

    // A quote, and the order awaiting payment made from it (API).
    const quoteId = await quotedApplication(EMAIL, PASSWORD);
    await expectAccessible(page, `/portal/teklif/${quoteId}`);
    const customer = anon();
    const signedIn = await customer.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
    if (signedIn.error) throw signedIn.error;
    const accepted = await customer.rpc("customer_accept_quote", {
      p_quote_id: quoteId,
      p_consents: CONSENTS,
    });
    if (accepted.error) throw accepted.error;
    const orderId = accepted.data as string;
    try {
      await expectAccessible(page, `/portal/siparis/${orderId}`);
    } finally {
      const cancelled = await customer.rpc("customer_cancel_order", { p_order_id: orderId });
      if (cancelled.error) throw cancelled.error;
    }
  });
}
