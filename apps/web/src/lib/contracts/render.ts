import { addonBreakdownOf, breakdownRows, windowsText } from "@/lib/billing/addon-breakdown";
import { formatDonum, formatKurus } from "@/lib/billing/money";
import { billingText } from "@/lib/i18n/messages/billing";
import { contractsText as C, type ContractDocumentKind } from "@/lib/i18n/messages/contracts";
import type { LegalBlock, LegalListItem } from "@/lib/i18n/messages/legal";
import {
  completeCompany,
  fillCompanyDocument,
  type CompleteCompany,
} from "@/lib/legal/company-placeholders";
import { isDraftVersion } from "@/lib/legal/versions";
import { addonInputsOf, quoteServiceEnd } from "@/lib/portal-billing/gardens";
import { contractTemplate, type TemplateKind } from "./templates";
import {
  addDays,
  istanbulDay,
  quoteKindOf,
  withdrawalLastDay,
  type ContractBuyer,
  type ContractInput,
} from "./model";

// The order-specific documents as legal blocks (docs/musteri-yonetimi.md
// "Sözleşme belgeleri (T04)"; H12, H13, H18, H19). One function per kind; the
// quote page shows exactly these blocks, display_sha256 hashes them
// (display-hash.ts) and the PDFs print them (lib/pdf/contract-pdf.tsx).
//
// Each document opens with the order's own section (quote and order numbers,
// kind, seller, buyer, package, service period, visit entitlement, amounts,
// VAT, total, the withdrawal rule or its last day, versions, the Ek-1 garden
// lines and, for an add-on, the H19 breakdown), followed by the registered
// template from legal.ts with the company placeholders (wave-1 helper) and the
// buyer's "**Hizmet alan:**" placeholders filled. The early-performance choice
// is not printed: its consent row is the evidence (contract_document.consent_ids).

export interface FilledDocument {
  kind: ContractDocumentKind;
  title: string;
  version: string;
  // A draft version or incomplete company information: every page and the
  // quote page carry a visible "TASLAK" mark.
  draft: boolean;
  orderNumber: string | null;
  blocks: LegalBlock[];
}

const percent = (bp: number) => String(bp / 100).replace(".", ",");

// "15 Mart 2027".
export function longDate(day: string): string {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(`${day.slice(0, 10)}T00:00:00Z`),
  );
}

const nonEmpty = (v: string | null | undefined): v is string => !!v && v.trim() !== "";

export function buyerName(b: ContractBuyer): string {
  return [b.companyTitle, b.name].filter(nonEmpty).join(" / ") || C.doc.unknown;
}

function sellerLine(company: CompleteCompany | null): string {
  if (!company)
    return "OBA Bilişim Teknolojileri LTD. [tam unvan: ticaret sicilindeki gibi], [adres]";
  return [
    company.legal_name,
    company.address,
    `${company.tax_office} / ${company.tax_number}`,
    `MERSİS ${company.mersis_number}`,
  ].join(", ");
}

function buyerLine(b: ContractBuyer): string {
  const tax =
    nonEmpty(b.taxOffice) || nonEmpty(b.taxNumber)
      ? `${b.taxOffice ?? ""} / ${b.taxNumber ?? ""}`
      : null;
  return [buyerName(b), b.address, tax, b.phone, b.email].filter(nonEmpty).join(", ");
}

// The contract's "**Hizmet alan:**" line with the buyer's values; a missing
// value keeps its placeholder, the identity number (only when the payment
// provider requires it) is never printed.
export function fillBuyerText(text: string, b: ContractBuyer): string {
  if (!text.startsWith("**Hizmet alan:**")) return text;
  const put = (from: string, value: string | null) => (out: string) =>
    nonEmpty(value) ? out.split(from).join(value) : out;
  return [
    (s: string) => s.split(", [T.C. kimlik no: yalnızca ödeme kuruluşu isterse]").join(""),
    put("[Ad soyad]", buyerName(b)),
    put("[adres]", b.address),
    put("[telefon]", b.phone),
    put("[e-posta]", b.email),
  ].reduce((s, f) => f(s), text);
}

function fillBuyerBlock(block: LegalBlock, b: ContractBuyer): LegalBlock {
  const item = (x: LegalListItem): LegalListItem =>
    typeof x === "string"
      ? fillBuyerText(x, b)
      : { text: fillBuyerText(x.text, b), children: x.children.map(item) };
  switch (block.kind) {
    case "ul":
    case "ol":
      return { kind: block.kind, items: block.items.map(item) };
    case "table":
      return block;
    default:
      return { kind: block.kind, text: fillBuyerText(block.text, b) };
  }
}

// The template of the version the document names (templates.ts): the
// current one on the quote page, the accepted one for an order.
export class TemplateUnavailableError extends Error {
  constructor(readonly version: string) {
    super("template_unavailable");
  }
}

function templateOf(which: TemplateKind, input: ContractInput) {
  const version = input.versions[which];
  const found = contractTemplate(which, version);
  if (!found) throw new TemplateUnavailableError(version);
  return found;
}

function template(which: TemplateKind, input: ContractInput): LegalBlock[] {
  const { title, blocks } = templateOf(which, input);
  return fillCompanyDocument(
    { title, description: "", source: "", blocks },
    input.company,
  ).blocks.map((b) => fillBuyerBlock(b, input.buyer));
}

function servicePeriod(input: ContractInput): string {
  const { quote, order } = input;
  if (order?.serviceStart && order.serviceEnd) {
    return C.doc.period(longDate(order.serviceStart), longDate(order.serviceEnd));
  }
  const addon = addonInputsOf(quote.inputs as never);
  if (addon) {
    return quote.proposedServiceStart && quote.proposedServiceStart > input.today
      ? C.doc.periodFrom(longDate(quote.proposedServiceStart), longDate(addon.periodEnd))
      : C.doc.periodOnPayment(longDate(addon.periodEnd));
  }
  const end = quoteServiceEnd({
    inputs: quote.inputs as never,
    proposed_service_start: quote.proposedServiceStart,
  });
  if (quote.proposedServiceStart && end) {
    return C.doc.period(longDate(quote.proposedServiceStart), longDate(end));
  }
  return C.doc.periodOnPayment(null);
}

function withdrawal(input: ContractInput): string {
  const { order, quote } = input;
  if (order?.activatedAt) {
    return C.doc.withdrawalDate(
      longDate(istanbulDay(order.activatedAt)),
      longDate(withdrawalLastDay(order.activatedAt)),
    );
  }
  if (!order && quote.totalKurus === 0) {
    return C.doc.withdrawalOnAcceptance(longDate(addDays(input.today, 14)));
  }
  return C.doc.withdrawalRule;
}

function linesTable(input: ContractInput): LegalBlock {
  const money = (k: number) => formatKurus(k, input.quote.currency);
  const addon = addonInputsOf(input.quote.inputs as never);
  return {
    kind: "table",
    head: [...C.doc.linesHead],
    rows: input.lines.map((l) => [
      String(l.lineNo),
      l.gardenName,
      l.location ?? C.doc.unknown,
      formatDonum(l.areaM2),
      addon ? `${l.visits}/${addon.visitsPerYear}` : String(l.visits),
      money(l.unitPriceKurus),
      money(l.minimumFeeKurus),
      money(l.inventoryFeeKurus),
      money(l.lineBaseKurus),
    ]),
  };
}

function breakdown(input: ContractInput): LegalBlock[] {
  const b = addonBreakdownOf(input.quote.inputs);
  if (!b) return [];
  const B = billingText.addonBreakdown;
  const out: LegalBlock[] = [{ kind: "h3", text: C.doc.breakdownTitle }];
  for (const line of b.lines) {
    out.push({ kind: "p", text: `**${C.doc.breakdownLine(line.gardenName)}**` });
    out.push({
      kind: "table",
      head: [...C.doc.breakdownHead],
      rows: breakdownRows(b, line, input.quote.currency).map((r) => [r.label, r.value]),
    });
  }
  out.push({
    kind: "ul",
    items: [
      `**${B.priceList}:** ${b.priceListName}`,
      `**${B.windows}:** ${windowsText(b)}`,
      B.roundingExample,
      `**${B.binding}**`,
    ],
  });
  return out;
}

// The order's own section, shared by the pre-information and the contract.
function orderSection(input: ContractInput): LegalBlock[] {
  const { quote, order } = input;
  const money = (k: number) => formatKurus(k, quote.currency);
  const kind = quoteKindOf(quote);
  const addon = addonInputsOf(quote.inputs as never);
  const company = completeCompany(input.company);
  const items: string[] = [
    C.doc.quote(quote.number),
    order ? C.doc.order(order.number) : C.doc.orderOnAcceptance,
    C.doc.kind(C.quoteKind[kind]),
  ];
  if (kind !== "initial") items.push(C.doc.separateContract);
  items.push(
    C.doc.seller(sellerLine(company)),
    C.doc.buyer(buyerLine(input.buyer)),
    C.doc.package(quote.packageName, quote.visitsPerYear),
    servicePeriod(input),
    addon
      ? C.doc.entitlementAddon(addon.visits, addon.visitsPerYear)
      : C.doc.entitlement(quote.visitsPerYear, quote.firstYear && quote.includesInventory),
  );
  if (!order) items.push(C.doc.validUntil(longDate(quote.validUntil)));
  items.push(C.doc.base(money(quote.baseKurus)));
  if (quote.discountKurus > 0) {
    items.push(C.doc.discount(percent(quote.discountBp), money(-quote.discountKurus)));
    if (quote.discountNote) items.push(C.doc.discountNote(quote.discountNote));
  }
  items.push(
    C.doc.subtotal(money(quote.subtotalKurus)),
    C.doc.vat(percent(quote.vatRateBp), money(quote.vatKurus)),
    C.doc.total(money(quote.totalKurus)),
    withdrawal(input),
    C.doc.versions(input.versions.pre_information, input.versions.distance_sales),
  );
  return [
    { kind: "h2", text: order ? C.doc.orderTitle : C.doc.quoteTitle },
    { kind: "ul", items },
    { kind: "h3", text: C.doc.linesTitle },
    linesTable(input),
    ...breakdown(input),
  ];
}

function isDraft(version: string, input: ContractInput): boolean {
  return isDraftVersion(version) || !completeCompany(input.company);
}

export function preInformationDocument(input: ContractInput): FilledDocument {
  const version = input.versions.pre_information;
  return {
    kind: "pre_information",
    title: templateOf("pre_information", input).title,
    version,
    draft: isDraft(version, input),
    orderNumber: input.order?.number ?? null,
    blocks: [...orderSection(input), ...template("pre_information", input)],
  };
}

function ek7(input: ContractInput): LegalBlock[] {
  const c = completeCompany(input.company);
  const to = c
    ? `${c.legal_name}, ${c.address}, ${c.email}, ${c.kep_address}`
    : "OBA Bilişim Teknolojileri LTD., [Adres], [E-posta], [KEP]";
  return [
    { kind: "h2", text: C.doc.ek7Title },
    {
      kind: "ul",
      items: [
        C.doc.ek7To(to),
        "Bu formla aşağıdaki hizmetin sunulmasına ilişkin sözleşmeden cayma hakkımı kullandığımı beyan ederim.",
        C.doc.ek7Order(input.order?.number ?? null),
        "**Cayma hakkına konu hizmet (bütün bahçeler ya da bahçenin adı):** …",
        "**Hizmetin bedeli:** …",
        "**Adı soyadı:** …",
        "**Adresi:** …",
        "**İmzası (yalnızca kâğıt üzerinde gönderilirse):** …",
        "**Tarih:** …",
      ],
    },
  ];
}

export function distanceContractDocument(input: ContractInput): FilledDocument {
  const version = input.versions.distance_sales;
  return {
    kind: "distance_sales",
    title: templateOf("distance_sales", input).title,
    version,
    draft: isDraft(version, input),
    orderNumber: input.order?.number ?? null,
    blocks: [...orderSection(input), ...template("distance_sales", input), ...ek7(input)],
  };
}

// The notice with the concrete last withdrawal day (H13 8B/1), once the
// order is active. Its registered version is the contract's.
export function withdrawalConfirmationDocument(input: ContractInput): FilledDocument {
  const { order } = input;
  if (!order?.activatedAt) throw new Error("order_not_active");
  const version = input.versions.distance_sales;
  const c = completeCompany(input.company);
  const channels = c
    ? C.withdrawal.channels(c.email, c.kep_address, c.address)
    : C.withdrawal.channels("[e-posta]", "[KEP]", "[Adres]");
  const paid = istanbulDay(order.activatedAt);
  const items: string[] = [
    C.doc.order(order.number),
    C.doc.quote(input.quote.number),
    C.doc.kind(C.quoteKind[quoteKindOf(input.quote)]),
    C.doc.seller(sellerLine(c)),
    C.doc.buyer(buyerLine(input.buyer)),
  ];
  if (order.serviceStart && order.serviceEnd) {
    items.push(C.withdrawal.period(longDate(order.serviceStart), longDate(order.serviceEnd)));
  }
  items.push(C.doc.total(formatKurus(input.quote.totalKurus, input.quote.currency)));
  return {
    kind: "withdrawal_confirmation",
    title: C.withdrawal.title,
    version,
    draft: isDraft(version, input),
    orderNumber: order.number,
    blocks: [
      { kind: "p", text: C.withdrawal.intro(order.number, longDate(paid)) },
      { kind: "p", text: C.withdrawal.lastDay(longDate(withdrawalLastDay(order.activatedAt))) },
      { kind: "ul", items },
      { kind: "h3", text: C.doc.linesTitle },
      linesTable(input),
      { kind: "p", text: C.withdrawal.how(channels) },
      { kind: "p", text: C.withdrawal.refund },
      ...ek7(input),
    ],
  };
}

export function contractDocument(kind: ContractDocumentKind, input: ContractInput): FilledDocument {
  switch (kind) {
    case "pre_information":
      return preInformationDocument(input);
    case "distance_sales":
      return distanceContractDocument(input);
    case "withdrawal_confirmation":
      return withdrawalConfirmationDocument(input);
  }
}

// The registered text kind of a document: the template its version names.
export function textKindOf(kind: ContractDocumentKind): TemplateKind {
  return kind === "pre_information" ? "pre_information" : "distance_sales";
}
