import type { CompanyFields } from "@/lib/legal/company-placeholders";
import type { ContractDocumentKind } from "@/lib/i18n/messages/contracts";

// What an order-specific contract document is made of (docs/musteri-yonetimi.md
// "Sözleşme belgeleri (T04)"): the quote, its garden lines, the order once the
// quote is accepted, the buyer, the seller and the text versions. Built by
// load.ts from the caller's own reads (customer or ops); pure from here on.

export type { ContractDocumentKind };

export type QuoteKind = "initial" | "addon" | "renewal";

export interface ContractLine {
  lineNo: number;
  gardenName: string;
  // "il / ilçe / köy" of the application garden, when known.
  location: string | null;
  areaM2: number;
  visits: number;
  unitPriceKurus: number;
  minimumFeeKurus: number;
  inventoryFeeKurus: number;
  lineBaseKurus: number;
}

export interface ContractQuote {
  id: string;
  number: string;
  packageName: string;
  visitsPerYear: number;
  includesInventory: boolean;
  firstYear: boolean;
  currency: string;
  baseKurus: number;
  discountKurus: number;
  discountBp: number;
  discountNote: string | null;
  subtotalKurus: number;
  vatRateBp: number;
  vatKurus: number;
  totalKurus: number;
  validUntil: string;
  proposedServiceStart: string | null;
  addonOfOrderId: string | null;
  renewalOfOrderId: string | null;
  // quote.inputs (the add-on breakdown and service of an add-on quote).
  inputs: unknown;
}

export interface ContractOrder {
  id: string;
  number: string;
  activatedAt: string | null;
  serviceStart: string | null;
  serviceEnd: string | null;
}

export interface ContractBuyer {
  name: string | null;
  companyTitle: string | null;
  taxOffice: string | null;
  taxNumber: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
}

export interface ContractInput {
  quote: ContractQuote;
  lines: ContractLine[];
  // Null before acceptance (the quote page).
  order: ContractOrder | null;
  buyer: ContractBuyer;
  company: CompanyFields | null;
  versions: { pre_information: string; distance_sales: string };
  // Istanbul day of the rendering (YYYY-MM-DD): only a zero-total quote,
  // which activates on acceptance, shows a date computed from it.
  today: string;
}

export function quoteKindOf(
  quote: Pick<ContractQuote, "addonOfOrderId" | "renewalOfOrderId">,
): QuoteKind {
  if (quote.addonOfOrderId) return "addon";
  if (quote.renewalOfOrderId) return "renewal";
  return "initial";
}

// YYYY-MM-DD in Istanbul of an instant.
export function istanbulDay(at: Date | string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date(at));
}

export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// H13 8B/1: the last day of the withdrawal period is the 14th day after the
// day the payment completed (the order activated), and it is included.
export function withdrawalLastDay(activatedAt: string): string {
  return addDays(istanbulDay(activatedAt), 14);
}
