import { describe, expect, it } from "vitest";
import { TOUR_STEPS } from "@/lib/demo/tour-steps";
import { isPublicPath } from "@/lib/site/public-paths";
import { demoSignupLabel, demoText } from "./demo";

describe("demo messages", () => {
  it("explains every start error", () => {
    for (const [code, text] of Object.entries(demoText.start.errors)) {
      expect(text, code).toBeTruthy();
    }
  });

  it("has a title and body for every tour step", () => {
    expect(Object.keys(demoText.tour.steps).sort()).toEqual(TOUR_STEPS.map((s) => s.id).sort());
    for (const s of Object.values(demoText.tour.steps)) {
      expect(s.title).toBeTruthy();
      expect(s.body.length).toBeGreaterThan(20);
    }
  });

  it("says the data is synthetic and the IP digest is pseudonymised", () => {
    expect(demoText.banner.text("12:30")).toBe(
      "Örnek bahçe · veriler ve görüntüler sentetik, konum temsilî · oturum bitişi 12:30",
    );
    const start = [...demoText.start.data, ...demoText.start.privacy].join("\n");
    expect(start).toContain("sentetik");
    expect(start).toContain("takma adlandırılmış");
    expect(start).toContain("48 saat");
    expect(start).toContain("Cloudflare");
    expect(start).toContain("3 saat");
    expect(start).not.toMatch(/geri döndürülemez|irreversible/i);
  });

  it("shows the session end without a case suffix", () => {
    // 15:30'a, 18:00'e, 16:00'ya: a fixed suffix is wrong for most times.
    for (const until of ["15:30", "18:00", "16:00", "14:45"]) {
      expect(demoText.banner.text(until)).toMatch(new RegExp(`${until}$`));
      expect(demoText.banner.short(until)).toMatch(new RegExp(`${until}$`));
    }
  });

  it("labels the banner's and the closing card's sign-up the same way", () => {
    expect(demoSignupLabel("/kayit")).toBe("Gerçek hesap aç");
    expect(demoSignupLabel("/iletisim")).toBe("Bize ulaşın");
  });

  it("keeps the PDF marker ASCII and links only to public pages", () => {
    expect(demoText.pdf.keywords).toMatch(/^[\x20-\x7e]+$/);
    for (const [, path] of demoText.start.privacyLink.matchAll(/\]\((\/[^)]*)\)/g)) {
      expect(isPublicPath(path)).toBe(true);
    }
  });

  it("starts every closed-write text with 'Demoda kapalı'", () => {
    for (const key of ["generic", "questions", "viewers", "boundary", "billing"] as const) {
      expect(demoText.closed[key]).toMatch(/^Demoda kapalı: gerçek hesabınızda /);
    }
  });
});
