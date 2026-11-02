import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RobotModel } from "@/lib/services/robots";
import { RobotBadge } from "./robot-badge";

const ROBOT: RobotModel = {
  id: "91600000-0000-4000-8000-000000000001",
  code: "maraba_i",
  name: "MARABA-I",
  shortDescription: "orchadOS tarama kitini taşıyan otonom bahçe robotu",
  capabilities: ["RTK GNSS ile santimetre konum ve otonom sürüş", "Misinalı biçme kafası"],
  imagePath: "/robots/maraba-dijital-ikiz.jpg",
  drawingPath: "/robots/maraba-i.svg",
};

// The keyboard and pointer behaviour is lib/services/robot-popover.test.ts
// and the e2e (tests/e2e/service-mowing.spec.ts); here the markup contract.
describe("robot badge", () => {
  const html = renderToStaticMarkup(<RobotBadge robot={ROBOT} />);

  it("is a closed button naming the robot, controlling its card", () => {
    const button = html.match(/<button[^>]*data-testid="robot-badge-button"[^>]*>/)?.[0] ?? "";
    expect(button).toContain('type="button"');
    expect(button).toContain('aria-expanded="false"');
    const controls = button.match(/aria-controls="([^"]+)"/)?.[1];
    expect(controls).toBeTruthy();
    expect(html).toContain(`id="${controls}"`);
    expect(html).toContain("Otonom robot · MARABA-I");
    // The icon is decoration.
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it("its card is a labelled, hidden, non-modal dialog until opened", () => {
    const card = html.match(/<div[^>]*data-testid="robot-card"[^>]*>/)?.[0] ?? "";
    expect(card).toContain('role="dialog"');
    expect(card).not.toContain("aria-modal");
    expect(card).toContain("hidden");
    const label = card.match(/aria-labelledby="([^"]+)"/)?.[1];
    expect(html).toMatch(new RegExp(`<p id="${label}"[^>]*>MARABA-I</p>`));
  });

  it("shows the representative image, the drawing, the description and the capabilities", () => {
    expect(html).toMatch(/<img[^>]*alt="MARABA-I: [^"]+"/);
    expect(html).toContain("maraba-dijital-ikiz.jpg");
    expect(html).toContain("<figcaption");
    expect(html).toContain("Temsili görsel");
    expect(html).toMatch(/<a href="\/robots\/maraba-i\.svg" target="_blank" rel="noopener"/);
    expect(html).toContain("Teknik çizim");
    expect(html).toContain("(yeni sekmede açılır)");
    expect(html).toContain(ROBOT.shortDescription);
    for (const c of ROBOT.capabilities) expect(html).toContain(`<li>${c}</li>`);
    expect(html).toMatch(/<button[^>]*>Kapat<\/button>/);
  });

  it("without an image or drawing leaves them out; compact keeps the same button", () => {
    const bare = renderToStaticMarkup(
      <RobotBadge robot={{ ...ROBOT, imagePath: null, drawingPath: null }} compact />,
    );
    expect(bare).not.toContain("<img");
    expect(bare).not.toContain("Temsili görsel");
    expect(bare).not.toContain("Teknik çizim");
    expect(bare).toContain('aria-expanded="false"');
  });
});
