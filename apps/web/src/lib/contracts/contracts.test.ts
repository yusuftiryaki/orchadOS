import { describe, expect, it, vi } from "vitest";
import { canonicalJson, legalTextHash, sha256Hex } from "@/lib/legal/text-hash";
import { COMPANY_PLACEHOLDERS } from "@/lib/legal/company-placeholders";
import { EARLY_PERFORMANCE_VERSION } from "@/lib/legal/early-performance";
import { acceptanceConsents, displaySha256 } from "./display-hash";
import { activeInput, addonInput, initialInput, renewalInput } from "./fixtures";
import { withdrawalLastDay } from "./model";
import {
  contractDocument,
  distanceContractDocument,
  fillBuyerText,
  preInformationDocument,
  withdrawalConfirmationDocument,
  type FilledDocument,
} from "./render";
import type { LegalBlock, LegalListItem } from "@/lib/i18n/messages/legal";

// A final (non-draft) version has no template yet: these tests render the
// "-v5" names with today's "-v4-taslak" templates (templates.test.ts covers
// the real lookup).
vi.mock("./templates", async (importOriginal) => {
  const real = await importOriginal<typeof import("./templates")>();
  return {
    ...real,
    contractTemplate: (kind: "pre_information" | "distance_sales", version: string) =>
      real.contractTemplate(kind, version.replace(/-v5$/, "-v4-taslak")),
  };
});

// Every text of a document, flattened (bold markers kept).
function itemText(x: LegalListItem): string {
  return typeof x === "string" ? x : [x.text, ...x.children.map(itemText)].join("\n");
}

function blockText(b: LegalBlock): string {
  switch (b.kind) {
    case "ul":
    case "ol":
      return b.items.map(itemText).join("\n");
    case "table":
      return [b.head, ...b.rows].map((r) => r.join(" | ")).join("\n");
    default:
      return b.text;
  }
}

function textOf(doc: FilledDocument): string {
  return doc.blocks.map(blockText).join("\n");
}

describe("withdrawal last day (H13 8B/1)", () => {
  it("is the 14th day after the payment day, in Istanbul", () => {
    expect(withdrawalLastDay("2027-03-01T07:00:00Z")).toBe("2027-03-15");
    // 23:30 UTC on 28 Feb is already 1 March in Istanbul.
    expect(withdrawalLastDay("2027-02-28T23:30:00Z")).toBe("2027-03-15");
  });
});

describe("filled pre-information and contract (H12, H13 (c))", () => {
  it("carries the H12 contents for an initial quote", () => {
    const text = textOf(preInformationDocument(initialInput()));
    for (const part of [
      "**Teklif no:** T-2026-000001",
      "**Sipariş türü:** İlk sipariş",
      "**Hizmet veren:** Örnek Denetim Hizmetleri A.Ş.",
      "**Hizmet alan:** Ayşe Yılmaz",
      "**Paket:** Standart · yılda 4 periyodik ziyaret",
      "**Ziyaret hakkı:** bahçe başına 4 periyodik ziyaret ve bir envanter ziyareti",
      "**İndirim (%10):** -1.500,00",
      "**KDV (%20):** 2.700,00",
      "**Toplam bedel (KDV dahil):** 16.200,00",
      "**Cayma süresi:** ödemenin tamamlandığı",
      "onbilgi-v4-taslak",
      "mesafeli-v4-taslak",
      "Şahinbey Ğ bahçesi | Gaziantep / Nizip / Test | 20 dönüm | 4",
      // The template follows.
      "Hizmetin temel nitelikleri",
    ]) {
      expect(text).toContain(part);
    }
    for (const placeholder of COMPANY_PLACEHOLDERS) expect(text).not.toContain(placeholder);
  });

  it("fills the buyer's line of the contract and never prints the identity number", () => {
    const text = textOf(distanceContractDocument(initialInput()));
    expect(text).toContain(
      '**Hizmet alan:** Ayşe Yılmaz, Cumhuriyet Mah. 1. Sok. No: 2, Nizip, Gaziantep, +905550000001, ayse@example.com ("Sahip")',
    );
    expect(text).not.toContain("[Ad soyad]");
    expect(text).not.toContain("T.C. kimlik no");
    // Ek-7 with the order number once there is one.
    expect(text).toContain("Ek-7: Örnek cayma formu (bu sipariş için)");
    expect(textOf(distanceContractDocument(activeInput()))).toContain(
      "**Sipariş numarası ve ödeme tarihi:** S-2027-000003",
    );
  });

  it("keeps a missing buyer value as its placeholder", () => {
    const line =
      '**Hizmet alan:** [Ad soyad], [T.C. kimlik no: yalnızca ödeme kuruluşu isterse], [adres], [telefon], [e-posta] ("Sahip").';
    expect(fillBuyerText(line, { ...initialInput().buyer, email: null, phone: null })).toBe(
      '**Hizmet alan:** Ayşe Yılmaz, Cumhuriyet Mah. 1. Sok. No: 2, Nizip, Gaziantep, [telefon], [e-posta] ("Sahip").',
    );
  });

  it("states that add-on and renewal quotes are separate contracts, with the add-on breakdown", () => {
    const addon = textOf(preInformationDocument(addonInput()));
    expect(addon).toContain("Ek sipariş (üyelik dönemi içinde eklenen bahçe)");
    expect(addon).toContain("ayrı bir mesafeli sözleşmedir (sözleşme Madde 8D/7 ve 12/2)");
    expect(addon).toContain("**Ziyaret hakkı:** bahçe başına 2/4 periyodik ziyaret");
    expect(addon).toContain("Ek teklifin hesabı (bahçe bazında)");
    expect(addon).toContain("İlkbahar 2027, Yaz 2027 (2)");
    expect(addon).toContain("1 Nisan 2027");
    expect(addon).toContain("31 Ekim 2027");
    const renewal = textOf(distanceContractDocument(renewalInput()));
    expect(renewal).toContain("**Sipariş türü:** Yenileme");
    expect(renewal).toContain("ayrı bir mesafeli sözleşmedir");
    expect(renewal).toContain("**Hizmet dönemi:** 1 Kasım 2027 – 31 Ekim 2028");
    expect(renewal).not.toContain("Ek teklifin hesabı");
  });

  it("states the rule before payment and the date for a zero-total quote", () => {
    expect(textOf(preInformationDocument(initialInput()))).toContain(
      "ör. ödemesi 1 Mart'ta tamamlanan siparişte 15 Mart",
    );
    const free = initialInput();
    free.quote = { ...free.quote, totalKurus: 0, vatKurus: 0, subtotalKurus: 0, discountKurus: 0 };
    expect(textOf(preInformationDocument(free))).toContain(
      "cayma süresinin son günü 11 Kasım 2026'dir",
    );
  });

  it("marks drafts and incomplete company information", () => {
    expect(preInformationDocument(initialInput()).draft).toBe(true); // -taslak versions
    const final = initialInput({
      versions: { pre_information: "onbilgi-v5", distance_sales: "mesafeli-v5" },
    });
    expect(preInformationDocument(final).draft).toBe(false);
    const incomplete = initialInput({
      versions: final.versions,
      company: { ...final.company!, complete: false },
    });
    const doc = preInformationDocument(incomplete);
    expect(doc.draft).toBe(true);
    expect(textOf(doc)).toContain("[tam unvan");
  });
});

describe("withdrawal confirmation", () => {
  it("states the concrete last day of an active order", () => {
    const doc = withdrawalConfirmationDocument(activeInput());
    expect(doc.kind).toBe("withdrawal_confirmation");
    expect(doc.orderNumber).toBe("S-2027-000003");
    const text = textOf(doc);
    expect(text).toContain("ödemesi 1 Mart 2027 günü tamamlandı");
    expect(text).toContain("**Cayma süresinin son günü: 15 Mart 2027.**");
    expect(text).toContain("destek@orchados.example ya da ornek@hs01.kep.tr adresine");
  });

  it("needs an active order", () => {
    expect(() => contractDocument("withdrawal_confirmation", initialInput())).toThrow(
      "order_not_active",
    );
  });
});

describe("display_sha256", () => {
  it("is the SHA-256 of the canonical JSON of exactly the shown fields", () => {
    const doc = preInformationDocument(initialInput());
    expect(displaySha256(doc)).toBe(
      sha256Hex(
        canonicalJson({
          blocks: doc.blocks,
          draft: doc.draft,
          kind: doc.kind,
          orderNumber: doc.orderNumber,
          title: doc.title,
          version: doc.version,
        }),
      ),
    );
    expect(displaySha256(doc)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable for the same input and changes with what is shown", () => {
    const a = displaySha256(preInformationDocument(initialInput()));
    expect(displaySha256(preInformationDocument(initialInput()))).toBe(a);
    const other = initialInput();
    other.buyer = { ...other.buyer, address: "Başka adres" };
    expect(displaySha256(preInformationDocument(other))).not.toBe(a);
    expect(displaySha256(distanceContractDocument(initialInput()))).not.toBe(a);
  });
});

describe("the object form sent at acceptance (§20.2)", () => {
  it("sends the version, the template hash and the display hash of each text", () => {
    const pre = preInformationDocument(initialInput());
    const contract = distanceContractDocument(initialInput());
    expect(acceptanceConsents(pre, contract, null)).toEqual({
      pre_information: {
        version: "onbilgi-v4-taslak",
        sha256: legalTextHash("pre_information"),
        display_sha256: displaySha256(pre),
      },
      distance_sales: {
        version: "mesafeli-v4-taslak",
        sha256: legalTextHash("distance_sales"),
        display_sha256: displaySha256(contract),
      },
    });
    expect(
      acceptanceConsents(pre, contract, { version: EARLY_PERFORMANCE_VERSION }).early_performance,
    ).toEqual({ version: EARLY_PERFORMANCE_VERSION, sha256: legalTextHash("early_performance") });
  });
});
