import { describe, expect, it } from "vitest";
import { legalText, type LegalBlock, type LegalListItem } from "@/lib/i18n/messages/legal";
import {
  COMPANY_PLACEHOLDERS,
  completeCompany,
  fillCompanyDocument,
  fillCompanyText,
  type CompanyFields,
} from "./company-placeholders";
import { LEGAL_TEXT_VERSIONS, type LegalText } from "./versions";

const COMPANY: CompanyFields = {
  legal_name: "Örnek Denetim A.Ş.",
  mersis_number: "0123456789012345",
  address: "Örnek Mah. 1, Şahinbey, Gaziantep",
  phone: "+905550000100",
  email: "destek@example.com",
  kep_address: "ornek@hs01.kep.tr",
  tax_office: "Şahinbey",
  tax_number: "1234567890",
  site_domain: "orchados.example",
  kvkk_email: "kvkk@orchados.example",
  complete: true,
};

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
const ALL = Object.keys(LEGAL_TEXT_VERSIONS) as LegalText[];
const BUYER = "**Hizmet alan:**";

describe("company placeholders (T21)", () => {
  it("fills every company placeholder of every text when the information is complete", () => {
    for (const key of ALL) {
      const filled = fillCompanyDocument(legalText[key], COMPANY).blocks.flatMap(texts);
      for (const line of filled.filter((l) => !l.startsWith(BUYER))) {
        for (const placeholder of COMPANY_PLACEHOLDERS) {
          expect(line, `${key}: ${placeholder}`).not.toContain(placeholder);
        }
        expect(line).not.toContain("OBA Bilişim Teknolojileri LTD. [");
      }
    }
  });

  it("keeps the buyer line of the contract (filled per order)", () => {
    const buyer = (blocks: LegalBlock[]) =>
      blocks.flatMap(texts).filter((l) => l.startsWith(BUYER));
    const original = buyer(legalText.distance_sales.blocks);
    expect(original).toHaveLength(1);
    expect(original[0]).toContain("[adres], [telefon], [e-posta]");
    expect(buyer(fillCompanyDocument(legalText.distance_sales, COMPANY).blocks)).toEqual(original);
  });

  it("writes the fields where the placeholders were", () => {
    const kvkk = fillCompanyDocument(legalText.kvkk_notice, COMPANY).blocks.flatMap(texts);
    expect(kvkk).toContain("**Unvan:** Örnek Denetim A.Ş.");
    expect(kvkk).toContain("**E-posta:** kvkk@orchados.example");
    expect(kvkk).toContain("**KEP:** ornek@hs01.kep.tr");
    const privacy = fillCompanyDocument(legalText.privacy, COMPANY)
      .blocks.flatMap(texts)
      .join("\n");
    expect(privacy).toContain("orchadOS sitesini (orchados.example)");
    expect(privacy).toContain("Veri sorumlusu Örnek Denetim A.Ş.'dir.");
    expect(privacy).toContain("demo.orchados.example");
    const contract = fillCompanyDocument(legalText.distance_sales, COMPANY).blocks.flatMap(texts);
    expect(contract.join("\n")).toContain(
      "**Hizmet veren:** Örnek Denetim A.Ş., Örnek Mah. 1, Şahinbey, Gaziantep, Şahinbey / 1234567890, ornek@hs01.kep.tr",
    );
    const pre = fillCompanyDocument(legalText.pre_information, COMPANY).blocks.flatMap(texts);
    expect(pre.join("\n")).toContain("**Vergi dairesi / no:** Şahinbey / 1234567890");
  });

  it("replaces nothing while the information is incomplete", () => {
    for (const info of [null, { ...COMPANY, complete: false }, { ...COMPANY, site_domain: null }]) {
      for (const key of ALL) {
        expect(fillCompanyDocument(legalText[key], info)).toBe(legalText[key]);
      }
    }
    expect(completeCompany({ ...COMPANY, kep_address: " " })).toBeNull();
    expect(fillCompanyText("[Adres]", null)).toBe("[Adres]");
  });

  it("leaves link labels and other brackets alone", () => {
    const filled = fillCompanyText(
      "[KVKK Aydınlatma Metni](/kvkk) ve [İptal ve İade Politikası](/iade); [Adres]",
      completeCompany(COMPANY),
    );
    expect(filled).toBe(
      "[KVKK Aydınlatma Metni](/kvkk) ve [İptal ve İade Politikası](/iade); Örnek Mah. 1, Şahinbey, Gaziantep",
    );
  });
});
