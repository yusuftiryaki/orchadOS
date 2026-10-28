import "server-only";
import { BILLING_COLUMNS } from "@/lib/billing/columns";
import type { Quote, QuoteItem } from "@/lib/billing/types";
import type { CompanyFields } from "@/lib/legal/company-placeholders";
import { LEGAL_TEXT_VERSIONS } from "@/lib/legal/versions";
import { isUuid } from "@/lib/supabase/query";
import type { Client } from "@/lib/supabase/types";
import { istanbulDay, type ContractBuyer, type ContractInput, type ContractOrder } from "./model";

// The inputs of the contract documents on the quote page, read live with the
// customer's own client (row level security decides what is visible). An
// order's documents are never rendered from these reads but from its
// acceptance snapshot (snapshot.ts), written from the input the customer
// accepted.

export type ContractActor = "customer" | "ops";

function check<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data;
}

const nonEmpty = (v: string | null | undefined): v is string => !!v && v.trim() !== "";
const joinNonEmpty = (parts: (string | null | undefined)[], sep = ", ") =>
  parts.filter(nonEmpty).join(sep) || null;

export async function companyInfo(supabase: Client): Promise<CompanyFields | null> {
  try {
    const { data, error } = await supabase.rpc("public_company_info");
    if (error || !data) return null;
    return (Array.isArray(data) ? data[0] : data) ?? null;
  } catch {
    return null;
  }
}

interface BillingRow {
  first_name?: string | null;
  last_name?: string | null;
  company_title?: string | null;
  tax_office?: string | null;
  tax_number?: string | null;
  address?: string | null;
  district?: string | null;
  city?: string | null;
  postal_code?: string | null;
  email?: string | null;
}

export function buyerOf(
  billing: BillingRow | null | undefined,
  contact: { phone?: string | null; email?: string | null } | null | undefined,
): ContractBuyer {
  return {
    name: joinNonEmpty([billing?.first_name, billing?.last_name], " "),
    companyTitle: billing?.company_title ?? null,
    taxOffice: billing?.tax_office ?? null,
    taxNumber: billing?.tax_number ?? null,
    address: joinNonEmpty([
      billing?.address,
      billing?.district,
      billing?.city,
      billing?.postal_code,
    ]),
    phone: contact?.phone ?? null,
    email: (nonEmpty(billing?.email) ? billing?.email : contact?.email) ?? null,
  };
}

async function customerBuyer(supabase: Client): Promise<ContractBuyer> {
  const [billing, contact] = await Promise.all([
    supabase.rpc("my_billing_profile"),
    supabase.rpc("my_owner_profile"),
  ]);
  return buyerOf(check(billing)?.[0], check(contact)?.[0]);
}

async function quoteParts(supabase: Client, quoteId: string) {
  const quote = check(
    await supabase.from("quote").select(BILLING_COLUMNS.quote).eq("id", quoteId).maybeSingle(),
  ) as Quote | null;
  if (!quote) return null;
  const items = check(
    await supabase
      .from("quote_item")
      .select(BILLING_COLUMNS.quote_item)
      .eq("quote_id", quoteId)
      .order("line_no"),
  ) as QuoteItem[];
  const gardenIds = items.flatMap((i) =>
    i.application_garden_id ? [i.application_garden_id] : [],
  );
  const gardens = gardenIds.length
    ? (check(
        await supabase
          .from("application_garden")
          .select("id, province, district, village")
          .in("id", gardenIds),
      ) as {
        id: string;
        province: string | null;
        district: string | null;
        village: string | null;
      }[])
    : [];
  const location = new Map(
    gardens.map((g) => [g.id, joinNonEmpty([g.province, g.district, g.village], " / ")]),
  );
  return {
    quote,
    contract: {
      id: quote.id,
      number: quote.number,
      packageName: quote.package_name,
      visitsPerYear: quote.periodic_visits_per_year,
      includesInventory: quote.includes_inventory,
      firstYear: quote.first_year,
      currency: quote.currency,
      baseKurus: quote.base_kurus,
      discountKurus: quote.discount_kurus,
      discountBp: quote.discount_bp,
      discountNote: quote.discount_note ?? null,
      subtotalKurus: quote.subtotal_kurus,
      vatRateBp: quote.vat_rate_bp,
      vatKurus: quote.vat_kurus,
      totalKurus: quote.total_kurus,
      validUntil: quote.valid_until,
      proposedServiceStart: quote.proposed_service_start ?? null,
      addonOfOrderId: quote.addon_of_order_id ?? null,
      renewalOfOrderId: quote.renewal_of_order_id ?? null,
      inputs: quote.inputs,
    },
    lines: items.map((i) => ({
      lineNo: i.line_no,
      gardenName: i.garden_name,
      location: (i.application_garden_id && location.get(i.application_garden_id)) || null,
      areaM2: Number(i.area_m2),
      visits: i.visits,
      unitPriceKurus: i.unit_price_kurus,
      minimumFeeKurus: i.minimum_fee_kurus,
      inventoryFeeKurus: i.inventory_fee_kurus,
      lineBaseKurus: i.line_base_kurus,
    })),
  };
}

const currentVersions = () => ({
  pre_information: LEGAL_TEXT_VERSIONS.pre_information,
  distance_sales: LEGAL_TEXT_VERSIONS.distance_sales,
});

// The quote page (before acceptance): the signed-in customer's own quote.
export async function quoteContractInput(
  supabase: Client,
  userId: string,
  quoteId: string,
  now = new Date(),
): Promise<ContractInput | null> {
  if (!isUuid(quoteId)) return null;
  const parts = await quoteParts(supabase, quoteId);
  if (!parts || parts.quote.customer_user_id !== userId) return null;
  const [buyerValue, company] = await Promise.all([customerBuyer(supabase), companyInfo(supabase)]);
  return {
    quote: parts.contract,
    lines: parts.lines,
    order: null,
    buyer: buyerValue,
    company,
    versions: currentVersions(),
    today: istanbulDay(now),
  };
}

// An accepted order as the caller sees it (the customer or an ops user of
// its org; row level security), with what the documents need of its live
// state: its folder, the activation and the service period.
export interface OrderRef {
  id: string;
  orgId: string;
  customerUserId: string;
  number: string;
  // The acceptance instant (service_order.created_at).
  acceptedAt: string;
  activatedAt: string | null;
  serviceStart: string | null;
  serviceEnd: string | null;
}

export async function orderRef(supabase: Client, orderId: string): Promise<OrderRef | null> {
  if (!isUuid(orderId)) return null;
  const row = check(
    await supabase
      .from("service_order")
      .select(
        "id, org_id, customer_user_id, quote_id, number, activated_at, service_start, service_end, created_at",
      )
      .eq("id", orderId)
      .maybeSingle(),
  );
  if (!row?.quote_id) return null;
  return {
    id: row.id,
    orgId: row.org_id,
    customerUserId: row.customer_user_id,
    number: row.number,
    acceptedAt: row.created_at,
    activatedAt: row.activated_at ?? null,
    serviceStart: row.service_start ?? null,
    serviceEnd: row.service_end ?? null,
  };
}

export const contractOrderOf = (o: OrderRef): ContractOrder => ({
  id: o.id,
  number: o.number,
  activatedAt: o.activatedAt,
  serviceStart: o.serviceStart,
  serviceEnd: o.serviceEnd,
});
