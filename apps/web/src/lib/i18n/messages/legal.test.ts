import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { blocksFromMarkdown } from "@/lib/legal/from-markdown";
import { isPublicPath } from "@/lib/site/public-paths";
import { LEGAL_TEXT_VERSIONS, type LegalText } from "@/lib/legal/versions";
import { legalText, type LegalBlock, type LegalListItem } from "./legal";

const itemTexts = (item: LegalListItem): string[] =>
  typeof item === "string" ? [item] : [item.text, ...item.children.flatMap(itemTexts)];

const texts = (block: LegalBlock): string[] => {
  switch (block.kind) {
    case "ul":
    case "ol":
      return block.items.flatMap(itemTexts);
    case "table":
      return [...block.head, ...block.rows.flat()];
    default:
      return [block.text];
  }
};

const text = (key: LegalText) => legalText[key].blocks.flatMap(texts).join("\n");

const readRepo = (path: string) =>
  readFileSync(new URL(`../../../../../../${path}`, import.meta.url), "utf8");

const ALL = Object.keys(LEGAL_TEXT_VERSIONS) as LegalText[];

describe("legal texts", () => {
  it("has a non-empty text for every versioned document", () => {
    for (const key of ALL) {
      expect(legalText[key].title).toBeTruthy();
      expect(legalText[key].blocks.length).toBeGreaterThan(3);
    }
  });

  it("links only to public pages", () => {
    for (const doc of Object.values(legalText)) {
      for (const t of doc.blocks.flatMap(texts)) {
        for (const [, path] of t.matchAll(/\]\((\/[^)]*)\)/g)) {
          expect(isPublicPath(path)).toBe(true);
        }
      }
    }
  });

  it("keeps lawyer notes out of the site", () => {
    const all = ALL.map(text).join("\n");
    expect(all).not.toMatch(/\[avukat|Avukata not|15\/1-ğ/i);
  });

  // docs/hukuk/kararlar.md H02, H06, H31: one optional box, marketing only.
  it("asks only the marketing consent (no AI transfer, no service improvement)", () => {
    const t = text("explicit_consent");
    expect(t).toContain("Tanıtım");
    expect(t).toContain("İYS");
    expect(t).not.toContain("Hizmetin geliştirilmesi");
    expect(t).not.toMatch(/yapay zekâ|Anthropic|yurt dışı/i);
    expect(t.match(/☐/g)).toHaveLength(1);
  });

  // docs/hukuk is the source; every text is mirrored whole, so its version
  // line must match and its blocks must be what the draft converts to.
  it.each(ALL)("keeps %s in step with its draft", (key) => {
    const doc = legalText[key];
    const draft = readRepo(doc.source);
    expect(draft).toContain(`**Sürüm:** ${LEGAL_TEXT_VERSIONS[key]} `);
    expect(doc.blocks).toEqual(blocksFromMarkdown(draft));
  });

  // Consents keep the version they were given for, so every superseded
  // version must still resolve to its text in docs/hukuk/arsiv/.
  it.each(ALL)("archives every earlier version of %s", (key) => {
    const doc = legalText[key];
    const [, prefix, current, suffix] = /^(.+)-v(\d+)(.*)$/.exec(LEGAL_TEXT_VERSIONS[key])!;
    const file = doc.source.replace(/^docs\/hukuk\/(.+)\.md$/, "$1");
    for (let v = 1; v < Number(current); v++) {
      const archived = readRepo(`docs/hukuk/arsiv/${file}-v${v}.md`);
      expect(archived).toContain(`**Sürüm:** ${prefix}-v${v}${suffix} `);
    }
  });

  it("covers adding and removing gardens (IP14)", () => {
    expect(text("distance_sales")).toContain("Madde 8D – Dönem içinde bahçe ekleme");
    expect(text("distance_sales")).toContain("Fesih ve bahçe bazında çıkarma");
    expect(text("distance_sales")).toContain("13.920,00 TL");
    expect(text("refund_policy")).toContain("5. Bahçe çıkarma");
    expect(text("refund_policy")).toContain("8.640,00 TL");
    expect(text("pre_information")).toContain("ek teklif");
    expect(text("pre_information")).toContain("Cayma hakkımı kullanıyorum");
  });

  it("shows the demo tour in the privacy policy (H27)", () => {
    const headings = legalText.privacy.blocks.flatMap((b) => (b.kind === "h2" ? [b.text] : []));
    expect(headings).toEqual([
      "1. Kapsam",
      "2. Siteyi gezerken",
      "3. Çerezler",
      "4. Hesap ve portal",
      "5. Demo turu",
      "6. Haklarınız",
      "7. Değişiklikler",
    ]);
    expect(text("privacy")).toContain("en geç 20 dakika");
  });

  // docs/hukuk/kararlar.md H37: mowing by hand, never a robot promise; the
  // audit stays independent; the early-performance box sits in the text.
  it("covers the mowing service addendum (H37)", () => {
    const t = text("service_terms");
    expect(t).toContain("**motorlu tırpanla**");
    expect(t).toContain("robotla ya da insansız bir araçla biçme taahhüt etmez");
    expect(t).toContain("12. Bağımsızlık");
    expect(t).toContain("Bu dönemde yabani ot biçmeyi orchadOS yaptı (tarih)");
    expect(t).toContain("md. 15/1-(h)");
    expect(t).toContain("☐ Ot biçmenin 14 günlük cayma süresi dolmadan yapılmasını istiyorum.");
    expect(t).toContain("](/bahcede-bulunanlar)");
  });

  it("names the field notice page in the KVKK notice (H01)", () => {
    expect(text("kvkk_notice")).toContain("](/bahcede-bulunanlar)");
    expect(text("field_notice")).toContain("5/2-f");
  });
});

describe("blocksFromMarkdown", () => {
  it("drops drafting notes and converts headings, lists, tables and links", () => {
    const md = [
      "# Başlık",
      "",
      "> **Taslak:** not",
      "",
      "**Sürüm:** x-v1-taslak · [Tarih]",
      "",
      "Giriş [metin](kvkk-aydinlatma-metni.md)'ne bakın.",
      "",
      "## 1. Bölüm",
      "",
      "1. Bir",
      "    - İki `kod`",
      "        - Üç",
      "",
      "| A | B |",
      "| --- | --- |",
      "| 1 | 2 |",
      "",
      "> İçerideki not",
      "",
      "**Ad:** ______",
    ].join("\n");
    expect(blocksFromMarkdown(md)).toEqual([
      { kind: "p", text: "Giriş [metin](/kvkk)'ne bakın." },
      { kind: "h2", text: "1. Bölüm" },
      {
        kind: "ol",
        items: [{ text: "Bir", children: [{ text: "İki kod", children: ["Üç"] }] }],
      },
      { kind: "table", head: ["A", "B"], rows: [["1", "2"]] },
      { kind: "p", text: "İçerideki not" },
    ]);
  });

  it("refuses links that have no public page", () => {
    expect(() => blocksFromMarkdown("**Sürüm:** v\n\nBak [x](kararlar.md).")).toThrow();
  });

  it.each(["#### Ek", "# Başlık", "#etiket"])("throws on an unsupported heading (%s)", (line) => {
    expect(() => blocksFromMarkdown(`**Sürüm:** v\n\nMetin.\n\n${line}\n`)).toThrow(
      `unsupported heading on body line 5: ${line}`,
    );
  });
});
