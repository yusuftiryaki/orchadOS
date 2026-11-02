import { expect, test } from "@playwright/test";
import { login, shot } from "./helpers";

// Chapter 10: what office and field staff should know about the expert panel.
// Read-only: the demo visit of 18 October (supabase/demo/scans.sql) is in review.

const IN_REVIEW = "e1000000-0000-4000-8000-000000000002";

test("uzman kuyruğu", async ({ page }) => {
  await login(page, "expert@example.com", "/uzman");
  await expect(page.getByRole("heading", { name: "Ziyaret kuyruğu" })).toBeVisible();
  await shot(page, "uzman/01-kuyruk.png", [
    { target: page.getByRole("heading", { name: "Ziyaret kuyruğu" }), n: 1, at: "right" },
    { target: page.getByRole("columnheader", { name: "Durum" }), n: 2 },
    { target: page.getByRole("columnheader", { name: "Kalan" }), n: 3 },
    { target: page.getByRole("link", { name: "İncele" }).first(), n: 4 },
  ]);
});

test("ziyaret incelemesi", async ({ page }) => {
  await login(page, "expert@example.com", `/uzman/ziyaret/${IN_REVIEW}`);
  await expect(page.getByRole("region", { name: "İlerleme" })).toBeVisible();
  await shot(page, "uzman/02-inceleme.png", [
    { target: page.getByRole("region", { name: "İlerleme" }), n: 1, at: "right" },
    { target: page.getByRole("navigation", { name: "Ağaçlar" }), n: 2, at: "right" },
    { target: page.getByRole("link", { name: "Özet ve imza" }), n: 3 },
  ]);
  await page.getByRole("tab", { name: /Takip istekleri/ }).click();
  const followups = page.getByTestId("tree-followups");
  await followups.scrollIntoViewIfNeeded();
  await shot(page, "uzman/03-agac-takip-istegi.png", [], { clip: followups });
});

test("özet: ek ziyaret isteği", async ({ page }) => {
  await login(page, "expert@example.com", `/uzman/ziyaret/${IN_REVIEW}/ozet`);
  const followups = page.getByTestId("parcel-followups");
  await followups.scrollIntoViewIfNeeded();
  await shot(page, "uzman/04-ek-ziyaret-istegi.png", [], { clip: followups });
});
