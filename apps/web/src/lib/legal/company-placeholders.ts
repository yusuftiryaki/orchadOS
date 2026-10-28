import type { LegalBlock, LegalDocument, LegalListItem } from "@/lib/i18n/messages/legal";

// The seller's company information in the legal texts (docs/hukuk/kararlar.md
// H34, T21). legal.ts stays equal to the drafts in docs/hukuk/ with their
// [placeholders]; they are filled at render time, and only when every
// required field is present (public_company_info().complete). Incomplete
// information leaves every placeholder as it is. The contract's
// "**Hizmet alan:**" line holds the buyer's placeholders ([Ad soyad], [adres],
// [telefon], [e-posta]): the order fills those (wave 2), never this helper.
// Pure: the contract PDFs of wave 2 use it too.

export interface CompanyFields {
  legal_name: string | null;
  mersis_number: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  kep_address: string | null;
  tax_office: string | null;
  tax_number: string | null;
  site_domain: string | null;
  kvkk_email: string | null;
  complete: boolean | null;
}

// A complete set of fields, or null when the texts keep their placeholders.
export type CompleteCompany = { [K in Exclude<keyof CompanyFields, "complete">]: string };

export function completeCompany(info: CompanyFields | null | undefined): CompleteCompany | null {
  if (!info?.complete) return null;
  const fields: CompleteCompany = {
    legal_name: info.legal_name ?? "",
    mersis_number: info.mersis_number ?? "",
    address: info.address ?? "",
    phone: info.phone ?? "",
    email: info.email ?? "",
    kep_address: info.kep_address ?? "",
    tax_office: info.tax_office ?? "",
    tax_number: info.tax_number ?? "",
    site_domain: info.site_domain ?? "",
    kvkk_email: info.kvkk_email ?? "",
  };
  return Object.values(fields).some((v) => v.trim() === "") ? null : fields;
}

// Every company placeholder of legal.ts on main, in the order they are
// replaced (longer variants first).
const OLD_NAME = "OBA Bilişim Teknolojileri LTD.";

function replacements(c: CompleteCompany): [string, string][] {
  const tax = `${c.tax_office} / ${c.tax_number}`;
  return [
    [`${OLD_NAME} [tam unvan: ticaret sicilindeki gibi]`, c.legal_name],
    // "Veri sorumlusu OBA Bilişim Teknolojileri LTD.'dir [tam unvan]."
    [`${OLD_NAME}'dir [tam unvan]`, `${c.legal_name}'dir`],
    ["[tam unvan: ticaret sicilindeki gibi]", c.legal_name],
    ["[tam unvan]", c.legal_name],
    ["**Vergi dairesi / no:** [ ]", `**Vergi dairesi / no:** ${tax}`],
    ["[vergi dairesi/no]", tax],
    ["[kvkk@alanadi]", c.kvkk_email],
    ["[alanadi]", c.site_domain],
    ["[KEP adresi]", c.kep_address],
    ["[KEP]", c.kep_address],
    ["[MERSİS]", c.mersis_number],
    ["[Adres]", c.address],
    ["[adres]", c.address],
    ["[Telefon]", c.phone],
    ["[E-posta]", c.email],
    ["[e-posta]", c.email],
  ];
}

// The placeholders a filled text must no longer contain (tests).
export const COMPANY_PLACEHOLDERS = [
  "[tam unvan",
  "[vergi dairesi/no]",
  "**Vergi dairesi / no:** [ ]",
  "[kvkk@alanadi]",
  "[alanadi]",
  "[KEP adresi]",
  "[KEP]",
  "[MERSİS]",
  "[Adres]",
  "[adres]",
  "[Telefon]",
  "[E-posta]",
  "[e-posta]",
] as const;

const BUYER_LINE = "**Hizmet alan:**";

export function fillCompanyText(text: string, company: CompleteCompany | null): string {
  if (!company || text.startsWith(BUYER_LINE)) return text;
  let out = text;
  for (const [from, to] of replacements(company)) out = out.split(from).join(to);
  return out;
}

function fillItem(item: LegalListItem, c: CompleteCompany): LegalListItem {
  return typeof item === "string"
    ? fillCompanyText(item, c)
    : { text: fillCompanyText(item.text, c), children: item.children.map((x) => fillItem(x, c)) };
}

function fillBlock(block: LegalBlock, c: CompleteCompany): LegalBlock {
  switch (block.kind) {
    case "ul":
    case "ol":
      return { kind: block.kind, items: block.items.map((x) => fillItem(x, c)) };
    case "table":
      return {
        kind: "table",
        head: block.head.map((x) => fillCompanyText(x, c)),
        rows: block.rows.map((r) => r.map((x) => fillCompanyText(x, c))),
      };
    default:
      return { kind: block.kind, text: fillCompanyText(block.text, c) };
  }
}

export function fillCompanyDocument(
  document: LegalDocument,
  info: CompanyFields | null | undefined,
): LegalDocument {
  const company = completeCompany(info);
  if (!company) return document;
  return { ...document, blocks: document.blocks.map((b) => fillBlock(b, company)) };
}
