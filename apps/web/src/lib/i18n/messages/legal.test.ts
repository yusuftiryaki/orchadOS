import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isPublicPath } from "@/lib/site/public-paths";
import { LEGAL_TEXT_VERSIONS } from "@/lib/legal/versions";
import { legalText, type LegalBlock } from "./legal";

const texts = (block: LegalBlock): string[] => {
  switch (block.kind) {
    case "ul":
    case "ol":
      return block.items.flatMap((i) => (typeof i === "string" ? [i] : [i.text, ...i.children]));
    case "table":
      return [...block.head, ...block.rows.flat()];
    default:
      return [block.text];
  }
};

describe("legal texts", () => {
  it("has a non-empty text for every versioned document", () => {
    for (const key of Object.keys(LEGAL_TEXT_VERSIONS) as (keyof typeof LEGAL_TEXT_VERSIONS)[]) {
      expect(legalText[key].title).toBeTruthy();
      expect(legalText[key].blocks.length).toBeGreaterThan(3);
    }
  });

  it("links only to public pages", () => {
    for (const doc of Object.values(legalText)) {
      for (const text of doc.blocks.flatMap(texts)) {
        for (const [, path] of text.matchAll(/\]\((\/[^)]*)\)/g)) {
          expect(isPublicPath(path)).toBe(true);
        }
      }
    }
  });

  it("keeps lawyer notes out of the site", () => {
    const all = Object.values(legalText)
      .flatMap((d) => d.blocks.flatMap(texts))
      .join("\n");
    expect(all).not.toMatch(/\[avukat|Avukata not/i);
  });

  it("asks only the two remaining explicit consents (no AI transfer)", () => {
    const text = legalText.explicit_consent.blocks.flatMap(texts).join("\n");
    expect(text).toContain("Hizmetin geliştirilmesi");
    expect(text).toContain("Tanıtım");
    expect(text).not.toMatch(/yapay zekâ|Anthropic|yurt dışı/i);
    expect(text.match(/☐/g)).toHaveLength(2);
  });

  // docs/hukuk is the source; these three texts are mirrored whole, so their
  // version line and article headings must match the draft.
  it.each(["distance_sales", "pre_information", "refund_policy"] as const)(
    "keeps %s in step with its draft",
    (key) => {
      const doc = legalText[key];
      const draft = readFileSync(
        new URL(`../../../../../../${doc.source}`, import.meta.url),
        "utf8",
      );
      expect(draft).toContain(`**Sürüm:** ${LEGAL_TEXT_VERSIONS[key]} `);
      const headings = [...draft.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
      expect(
        doc.blocks.filter((b) => b.kind === "h2").map((b) => (b as { text: string }).text),
      ).toEqual(headings);
    },
  );

  it("covers adding and removing gardens (IP14)", () => {
    const text = (key: keyof typeof legalText) => legalText[key].blocks.flatMap(texts).join("\n");
    expect(text("distance_sales")).toContain("Madde 8D – Dönem içinde bahçe ekleme");
    expect(text("distance_sales")).toContain("Fesih ve bahçe bazında çıkarma");
    expect(text("distance_sales")).toContain("4.500,00 TL");
    expect(text("refund_policy")).toContain("5. Bahçe çıkarma");
    expect(text("refund_policy")).toContain("6.000,00 TL");
    expect(text("pre_information")).toContain("ek teklif");
    expect(text("pre_information")).toContain("Cayma hakkımı kullanıyorum");
  });
});
