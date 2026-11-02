import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Locator, Page } from "@playwright/test";

// Shared steps of the guide screenshots (docs/kilavuz/). Images go to
// docs/kilavuz/img/<area>/NN-<slug>.png; numbered markers on the image match
// the numbered callouts in the chapter text.

export const PASSWORD = "orchados-dev";
export const IMG_DIR = resolve(import.meta.dirname, "../../../../docs/kilavuz/img");
export const PHONE = { width: 390, height: 844 };

export async function login(page: Page, email: string, next: string) {
  await page.goto(`/giris?next=${encodeURIComponent(next)}`);
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Parola").fill(PASSWORD);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await page.waitForURL((url) => url.pathname === next.split("?")[0], { timeout: 60_000 });
}

export interface Marker {
  // The element the number points at.
  target: Locator;
  n: number;
  // Where the badge sits: just left of the element (default), inside its
  // right end, on its centre, or under it (small header items).
  at?: "left" | "right" | "center" | "below";
}

// Draws numbered badges over the page, takes the shot and removes them.
export async function shot(
  page: Page,
  file: string,
  markers: Marker[] = [],
  options: { fullPage?: boolean; clip?: Locator } = {},
) {
  const path = resolve(IMG_DIR, file);
  mkdirSync(dirname(path), { recursive: true });
  // Fonts and images settle before the shot.
  await page.evaluate(() => document.fonts.ready);
  const boxes: { x: number; y: number; n: number }[] = [];
  const scroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  for (const m of markers) {
    const box = await m.target.first().boundingBox();
    if (!box) throw new Error(`marker ${m.n} (${file}) has no box`);
    const x =
      m.at === "right"
        ? box.x + box.width - 16
        : m.at === "center" || m.at === "below"
          ? box.x + box.width / 2
          : box.x - 18;
    const y = m.at === "below" ? box.y + box.height + 14 : box.y + box.height / 2;
    boxes.push({ x: x + scroll.x, y: y + scroll.y, n: m.n });
  }
  await page.evaluate((list) => {
    const layer = document.createElement("div");
    layer.id = "kilavuz-markers";
    layer.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;z-index:2147483647;";
    for (const b of list) {
      const el = document.createElement("div");
      el.textContent = String(b.n);
      el.style.cssText =
        `position:absolute;left:${Math.max(16, b.x) - 14}px;top:${Math.max(2, b.y - 14)}px;` +
        "width:28px;height:28px;border-radius:50%;background:#d6336c;color:#fff;" +
        "font:700 15px/28px system-ui,sans-serif;text-align:center;" +
        "box-shadow:0 0 0 3px #fff,0 2px 6px rgba(0,0,0,.4);pointer-events:none;";
      layer.appendChild(el);
    }
    document.body.appendChild(layer);
  }, boxes);
  try {
    if (options.clip) await options.clip.screenshot({ path });
    else await page.screenshot({ path, fullPage: options.fullPage ?? false });
  } finally {
    await page.evaluate(() => document.getElementById("kilavuz-markers")?.remove());
  }
}
