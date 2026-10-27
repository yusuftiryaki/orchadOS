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
});
