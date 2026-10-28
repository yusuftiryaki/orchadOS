import { BILLING_COLUMNS } from "@/lib/billing/columns";
import {
  LEGAL_GATE_REASONS,
  type ApplicationGarden,
  type CustomerGarden,
  type LegalGateReason,
  type OrderInstallment,
  type ParcelServiceStatus,
  type Payment,
  type PaymentItem,
  type Quote,
  type QuoteItem,
  type Refund,
  type ServiceApplication,
  type ServiceOrder,
  type ServiceOrderItem,
  type ServicePeriod,
} from "@/lib/billing/types";
import { billingReasonOf, type BillingError } from "@/lib/billing/errors";
import { planRowOf, type PlanRow } from "@/lib/billing/installments";
import type { Position } from "@/lib/map/geo";
import type { RemovalTimingChoice } from "@/lib/portal-billing/validation";
import { isUuid } from "@/lib/supabase/query";
import type { Client } from "@/lib/supabase/types";

// Reads of the customer portal (docs/musteri-yonetimi.md §10). Every query
// runs as the signed-in customer: row level security decides what is visible,
// the user filter keeps rows of other customers out even for a user that is
// also an org member. Billing tables are read with BILLING_COLUMNS only
// (internal columns are not granted; `select("*")` fails).

function check<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data;
}

// --------------------------------------------------------------------------
// Packages and prices
// --------------------------------------------------------------------------

export interface PackagePrice {
  packageId: string;
  code: string;
  name: string;
  description: string | null;
  periodicVisitsPerYear: number;
  includesInventory: boolean;
  priceListVersion: number;
  validFrom: string;
  currency: string;
  vatRateBp: number;
  unitPriceKurus: number;
  minimumFeeKurus: number;
  inventoryFeeKurus: number;
}

export async function listPackagePrices(supabase: Client): Promise<PackagePrice[]> {
  const rows = check(await supabase.rpc("public_package_prices"));
  return (rows ?? []).map((r) => ({
    packageId: r.package_id,
    code: r.code,
    name: r.name,
    description: r.description ?? null,
    periodicVisitsPerYear: r.periodic_visits_per_year,
    includesInventory: r.includes_inventory,
    priceListVersion: r.price_list_version,
    validFrom: r.valid_from,
    currency: r.currency,
    vatRateBp: r.vat_rate_bp,
    unitPriceKurus: r.unit_price_kurus,
    minimumFeeKurus: r.minimum_fee_kurus,
    inventoryFeeKurus: r.inventory_fee_kurus,
  }));
}

export interface PricePreview {
  // customer_addon_preview (IP14): the service the add-on lines would get.
  addon?: {
    serviceStart: string;
    serviceEnd: string;
    visitsPerYear: number;
    visits: number;
  };
  lines: {
    lineNo: number;
    areaM2: number;
    visitAmountKurus: number;
    inventoryFeeKurus: number;
    subtotalKurus: number;
    vatKurus: number;
    totalKurus: number;
  }[];
  subtotalKurus: number;
  vatKurus: number;
  totalKurus: number;
  vatRateBp: number;
  priceListVersion: number;
}

// The non-binding price of the declared areas (price_preview); null when the
// package has no published price or there is no area yet.
export async function previewPrice(
  supabase: Client,
  packageId: string | null,
  areasM2: number[],
): Promise<PricePreview | null> {
  if (!packageId || areasM2.length === 0) return null;
  const { data, error } = await supabase.rpc("price_preview", {
    p_package_id: packageId,
    p_areas_m2: areasM2,
  });
  if (error || !data || data.length === 0) return null;
  return previewOf(data);
}

type PreviewRow = {
  line_no: number;
  area_m2: number;
  visit_amount_kurus: number;
  inventory_fee_kurus: number;
  line_subtotal_kurus: number;
  line_vat_kurus: number;
  line_total_kurus: number;
  vat_rate_bp: number;
  price_list_version: number;
};

function previewOf(data: PreviewRow[]): PricePreview {
  const lines = data.map((r) => ({
    lineNo: r.line_no,
    areaM2: Number(r.area_m2),
    visitAmountKurus: r.visit_amount_kurus,
    inventoryFeeKurus: r.inventory_fee_kurus,
    subtotalKurus: r.line_subtotal_kurus,
    vatKurus: r.line_vat_kurus,
    totalKurus: r.line_total_kurus,
  }));
  const sum = (k: "subtotalKurus" | "vatKurus" | "totalKurus") =>
    lines.reduce((a, l) => a + l[k], 0);
  return {
    lines,
    subtotalKurus: sum("subtotalKurus"),
    vatKurus: sum("vatKurus"),
    totalKurus: sum("totalKurus"),
    vatRateBp: data[0].vat_rate_bp,
    priceListVersion: data[0].price_list_version,
  };
}

// The non-binding price of a member's added gardens (customer_addon_preview,
// docs/bahce-yonetimi.md §4.1): prorated to the rest of the membership
// period. No area yet: null; a refusal (addon_period_too_short, …) as its code.
export async function previewAddonPrice(
  supabase: Client,
  areasM2: number[],
): Promise<{ ok: true; preview: PricePreview | null } | { ok: false; error: BillingError }> {
  if (areasM2.length === 0) return { ok: true, preview: null };
  const { data, error } = await supabase.rpc("customer_addon_preview", { p_areas_m2: areasM2 });
  if (error) return { ok: false, error: billingReasonOf(error) };
  if (!data || data.length === 0) return { ok: true, preview: null };
  const first = data[0];
  return {
    ok: true,
    preview: {
      ...previewOf(data),
      addon: {
        serviceStart: first.service_start,
        serviceEnd: first.service_end,
        visitsPerYear: first.periodic_visits_per_year,
        visits: first.visits,
      },
    },
  };
}

// --------------------------------------------------------------------------
// Membership and gardens (IP14, docs/bahce-yonetimi.md §9.6)
// --------------------------------------------------------------------------

export interface ServicePeriods {
  // Every current membership period, by its end (my_service_period).
  periods: ServicePeriod[];
  // The one the portal and add-ons use (is_primary); null: no membership.
  primary: ServicePeriod | null;
}

// A user without a customer profile (a co-owner, a demo visitor) gets no rows.
export async function getServicePeriods(supabase: Client): Promise<ServicePeriods> {
  const periods = (check(await supabase.rpc("my_service_period")) ?? []) as ServicePeriod[];
  return { periods, primary: periods.find((p) => p.is_primary) ?? null };
}

// One row per garden of the customer (my_gardens): in service, leaving,
// starting next period, or removed with its reports still open.
export async function listMyGardens(supabase: Client): Promise<CustomerGarden[]> {
  return (check(await supabase.rpc("my_gardens")) ?? []) as CustomerGarden[];
}

// The service status of a parcel for anyone with access (owner, co-owner);
// null when the function returns no row.
export async function getParcelServiceStatus(
  supabase: Client,
  parcelId: string,
): Promise<ParcelServiceStatus | null> {
  if (!isUuid(parcelId)) return null;
  const { data, error } = await supabase.rpc("parcel_service_status", { p_parcel_id: parcelId });
  if (error) return null;
  return (data?.[0] as ParcelServiceStatus | undefined) ?? null;
}

export type RemovalTiming = RemovalTimingChoice;

export interface RemovalPreview {
  timing: RemovalTiming;
  effectiveOn: string;
  accessUntil: string;
  refundEstimateKurus: number;
  withdrawalUntil: string | null;
  visitsEntitled: number;
  visitsUsed: number;
}

// One customer_garden_removal_preview call per timing option (§5.1); the
// first refusal (parcel_order_pending, garden_removal_open, …) stops it.
export async function previewGardenRemoval(
  supabase: Client,
  parcelId: string,
  timings: readonly RemovalTiming[],
): Promise<{ ok: true; options: RemovalPreview[] } | { ok: false; error: BillingError }> {
  const results = await Promise.all(
    timings.map((timing) =>
      supabase.rpc("customer_garden_removal_preview", {
        p_parcel_id: parcelId,
        p_timing: timing,
      }),
    ),
  );
  const options: RemovalPreview[] = [];
  for (const [i, { data, error }] of results.entries()) {
    // The withdrawal window may close between the read and the preview.
    if (error && timings[i] === "withdrawal" && error.message === "withdrawal_expired") continue;
    if (error) return { ok: false, error: billingReasonOf(error) };
    const row = data?.[0];
    if (!row) continue;
    options.push({
      timing: timings[i],
      effectiveOn: row.effective_on,
      accessUntil: row.access_until,
      refundEstimateKurus: row.refund_estimate_kurus,
      withdrawalUntil: row.withdrawal_until ?? null,
      visitsEntitled: row.visits_entitled,
      visitsUsed: row.visits_used,
    });
  }
  return { ok: true, options };
}

// The parcel of an order line before and after activation, as
// private.order_line_parcels resolves it: the line's own parcel, else its
// quote line's, else its application garden's.
export function lineParcelOf(
  item: Pick<ServiceOrderItem, "parcel_id" | "quote_item_id">,
  quoteItems: Map<string, Pick<QuoteItem, "parcel_id" | "application_garden_id">>,
  gardens: Map<string, string | null>,
): string | null {
  if (item.parcel_id) return item.parcel_id;
  const qi = item.quote_item_id ? quoteItems.get(item.quote_item_id) : undefined;
  if (!qi) return null;
  if (qi.parcel_id) return qi.parcel_id;
  return qi.application_garden_id ? (gardens.get(qi.application_garden_id) ?? null) : null;
}

// The customer's order awaiting payment that holds this parcel (the reason
// of parcel_order_pending), for a link to it; null when no line resolves to
// the parcel (the caller links to the order list instead).
export async function pendingOrderOfParcel(
  supabase: Client,
  userId: string,
  parcelId: string,
): Promise<string | null> {
  const orders = check(
    await supabase
      .from("service_order")
      .select(BILLING_COLUMNS.service_order)
      .eq("customer_user_id", userId)
      .eq("status", "awaiting_payment"),
  ) as ServiceOrder[];
  if (orders.length === 0) return null;
  const items = check(
    await supabase
      .from("service_order_item")
      .select(BILLING_COLUMNS.service_order_item)
      .in(
        "order_id",
        orders.map((o) => o.id),
      ),
  ) as ServiceOrderItem[];
  const quoteItemIds = items.flatMap((i) =>
    !i.parcel_id && i.quote_item_id ? [i.quote_item_id] : [],
  );
  const quoteItems = quoteItemIds.length
    ? (check(
        await supabase.from("quote_item").select(BILLING_COLUMNS.quote_item).in("id", quoteItemIds),
      ) as QuoteItem[])
    : [];
  const gardenIds = quoteItems.flatMap((q) =>
    !q.parcel_id && q.application_garden_id ? [q.application_garden_id] : [],
  );
  const gardens = gardenIds.length
    ? (check(
        await supabase
          .from("application_garden")
          .select(BILLING_COLUMNS.application_garden)
          .in("id", gardenIds),
      ) as ApplicationGarden[])
    : [];
  const quoteItemMap = new Map(quoteItems.map((q) => [q.id, q]));
  const gardenMap = new Map(gardens.map((g) => [g.id, g.parcel_id]));
  return items.find((i) => lineParcelOf(i, quoteItemMap, gardenMap) === parcelId)?.order_id ?? null;
}

// Parcels that were ever on one of the customer's orders or linked to one of
// their applications: an owned parcel among them without a my_gardens row has
// left the service (ended, terminated, cancelled or not paid yet); only the
// rest are pilot parcels (IP14, docs/bahce-yonetimi.md §11).
export async function listOrderedParcelIds(supabase: Client, userId: string): Promise<string[]> {
  const [items, gardens] = await Promise.all([
    supabase
      .from("service_order_item")
      .select(BILLING_COLUMNS.service_order_item)
      .eq("customer_user_id", userId)
      .not("parcel_id", "is", null),
    supabase
      .from("application_garden")
      .select(BILLING_COLUMNS.application_garden)
      .eq("customer_user_id", userId)
      .not("parcel_id", "is", null),
  ]);
  const ids = [
    ...(check(items) as ServiceOrderItem[]).map((i) => i.parcel_id),
    ...(check(gardens) as ApplicationGarden[]).map((g) => g.parcel_id),
  ];
  return [...new Set(ids.filter((id): id is string => !!id))];
}

// Parcels the user owns (parcel_access role owner): the pilot parcels without
// an order line are told to contact us on the account page.
export async function listOwnedParcelIds(supabase: Client, userId: string): Promise<string[]> {
  const rows = check(
    await supabase
      .from("parcel_access")
      .select("parcel_id")
      .eq("user_id", userId)
      .eq("role", "owner"),
  ) as { parcel_id: string }[];
  return rows.map((r) => r.parcel_id);
}

// --------------------------------------------------------------------------
// Applications
// --------------------------------------------------------------------------

export type Garden = Omit<ApplicationGarden, "position" | "boundary"> & {
  position: Position | null;
  boundary: Position[] | null;
};

type GeoJsonPoint = { type: "Point"; coordinates: Position };
type GeoJsonPolygon = { type: "Polygon"; coordinates: Position[][] };

function pointOf(value: unknown): Position | null {
  const p = value as GeoJsonPoint | null;
  return p?.type === "Point" && Array.isArray(p.coordinates)
    ? [p.coordinates[0], p.coordinates[1]]
    : null;
}

// The open ring of a GeoJSON polygon (the closing vertex dropped).
function ringOf(value: unknown): Position[] | null {
  const p = value as GeoJsonPolygon | null;
  if (p?.type !== "Polygon" || !Array.isArray(p.coordinates?.[0])) return null;
  const ring = p.coordinates[0].map(([lon, lat]) => [lon, lat] as Position);
  if (ring.length > 1) {
    const [a, b] = [ring[0], ring[ring.length - 1]];
    if (a[0] === b[0] && a[1] === b[1]) ring.pop();
  }
  return ring;
}

function toGarden(row: ApplicationGarden): Garden {
  return { ...row, position: pointOf(row.position), boundary: ringOf(row.boundary) };
}

export async function listApplications(
  supabase: Client,
  userId: string,
): Promise<ServiceApplication[]> {
  return check(
    await supabase
      .from("service_application")
      .select(BILLING_COLUMNS.service_application)
      .eq("customer_user_id", userId)
      .order("created_at", { ascending: false }),
  ) as ServiceApplication[];
}

export interface ApplicationView {
  application: ServiceApplication;
  gardens: Garden[];
  quotes: Quote[];
}

export async function getApplication(
  supabase: Client,
  userId: string,
  id: string,
): Promise<ApplicationView | null> {
  if (!isUuid(id)) return null;
  const application = check(
    await supabase
      .from("service_application")
      .select(BILLING_COLUMNS.service_application)
      .eq("id", id)
      .eq("customer_user_id", userId)
      .maybeSingle(),
  ) as ServiceApplication | null;
  if (!application) return null;
  const [gardens, quotes] = await Promise.all([
    supabase
      .from("application_garden")
      .select(BILLING_COLUMNS.application_garden)
      .eq("application_id", id)
      .order("sort_order"),
    supabase
      .from("quote")
      .select(BILLING_COLUMNS.quote)
      .eq("application_id", id)
      .order("created_at", { ascending: false }),
  ]);
  return {
    application,
    gardens: (check(gardens) as ApplicationGarden[]).map(toGarden),
    quotes: check(quotes) as Quote[],
  };
}

export type GardenDetail = {
  authorization_basis: string | null;
  deed_block: string | null;
  deed_parcel: string | null;
  is_shared_deed: boolean | null;
  used_portion_note: string | null;
  access_note: string | null;
  site_contact_name: string | null;
  site_contact_phone: string | null;
};

export async function getGardenDetail(
  supabase: Client,
  gardenId: string,
): Promise<GardenDetail | null> {
  const { data, error } = await supabase.rpc("customer_application_garden_detail", {
    p_garden_id: gardenId,
  });
  if (error) return null;
  return (data?.[0] as GardenDetail | undefined) ?? null;
}

// --------------------------------------------------------------------------
// Quotes, orders, payments
// --------------------------------------------------------------------------

export async function listQuotes(supabase: Client, userId: string): Promise<Quote[]> {
  return check(
    await supabase
      .from("quote")
      .select(BILLING_COLUMNS.quote)
      .eq("customer_user_id", userId)
      .order("created_at", { ascending: false }),
  ) as Quote[];
}

export async function getQuote(
  supabase: Client,
  userId: string,
  id: string,
): Promise<{ quote: Quote; items: QuoteItem[]; orderId: string | null } | null> {
  if (!isUuid(id)) return null;
  const quote = check(
    await supabase
      .from("quote")
      .select(BILLING_COLUMNS.quote)
      .eq("id", id)
      .eq("customer_user_id", userId)
      .maybeSingle(),
  ) as Quote | null;
  if (!quote) return null;
  const [items, order] = await Promise.all([
    supabase
      .from("quote_item")
      .select(BILLING_COLUMNS.quote_item)
      .eq("quote_id", id)
      .order("line_no"),
    supabase.from("service_order").select("id").eq("quote_id", id).maybeSingle(),
  ]);
  return {
    quote,
    items: check(items) as QuoteItem[],
    orderId: (check(order) as { id: string } | null)?.id ?? null,
  };
}

// The payment plan of a quote as if accepted today (quote_installment_plan;
// H35 (b)). Empty when the function returns no row (a zero total), or cannot
// be read (not deployed yet: the page then shows the totals only).
export async function getQuotePlan(supabase: Client, quoteId: string): Promise<PlanRow[]> {
  const { data, error } = await supabase.rpc("quote_installment_plan", { p_quote_id: quoteId });
  if (error || !data) return [];
  return data.map(planRowOf);
}

export async function listOrders(supabase: Client, userId: string): Promise<ServiceOrder[]> {
  return check(
    await supabase
      .from("service_order")
      .select(BILLING_COLUMNS.service_order)
      .eq("customer_user_id", userId)
      .order("created_at", { ascending: false }),
  ) as ServiceOrder[];
}

export interface OrderView {
  order: ServiceOrder;
  items: ServiceOrderItem[];
  payments: Payment[];
  quote: Pick<Quote, "id" | "number" | "package_name" | "application_id"> | null;
  plan: PlanRow[];
}

export async function getOrder(
  supabase: Client,
  userId: string,
  id: string,
): Promise<OrderView | null> {
  if (!isUuid(id)) return null;
  const order = check(
    await supabase
      .from("service_order")
      .select(BILLING_COLUMNS.service_order)
      .eq("id", id)
      .eq("customer_user_id", userId)
      .maybeSingle(),
  ) as ServiceOrder | null;
  if (!order) return null;
  const [items, payments, quote, plan] = await Promise.all([
    supabase
      .from("service_order_item")
      .select(BILLING_COLUMNS.service_order_item)
      .eq("order_id", id)
      .order("line_no"),
    supabase
      .from("payment")
      .select(BILLING_COLUMNS.payment)
      .eq("order_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("quote")
      .select("id, number, package_name, application_id")
      .eq("id", order.quote_id)
      .maybeSingle(),
    supabase
      .from("order_installment")
      .select(BILLING_COLUMNS.order_installment)
      .eq("order_id", id)
      .order("seq"),
  ]);
  return {
    order,
    items: check(items) as ServiceOrderItem[],
    payments: check(payments) as Payment[],
    quote: check(quote) as OrderView["quote"],
    plan: (check(plan) as OrderInstallment[]).map(planRowOf),
  };
}

export interface PaymentInstructions {
  bankName: string | null;
  iban: string | null;
  ibanHolder: string | null;
  reference: string;
  outstandingKurus: number;
  currency: string;
  paymentDueAt: string | null;
  // T13 (H16): the card payment asks for the TCKN (never stored).
  identityNumberRequired?: boolean;
}

export async function getPaymentInstructions(
  supabase: Client,
  orderId: string,
): Promise<PaymentInstructions | null> {
  const [{ data, error }, profile] = await Promise.all([
    supabase.rpc("customer_payment_instructions", { p_order_id: orderId }),
    supabase.rpc("my_billing_profile"),
  ]);
  const row = error ? undefined : data?.[0];
  if (!row) return null;
  return {
    identityNumberRequired: profile.data?.[0]?.identity_number_required === true,
    bankName: row.bank_name ?? null,
    iban: row.iban ?? null,
    ibanHolder: row.iban_holder ?? null,
    reference: row.reference,
    outstandingKurus: row.outstanding_kurus,
    currency: row.currency,
    paymentDueAt: row.payment_due_at ?? null,
  };
}

export type PaymentRow = Payment & { order_number: string | null };

export async function listPayments(supabase: Client, userId: string): Promise<PaymentRow[]> {
  const payments = check(
    await supabase
      .from("payment")
      .select(BILLING_COLUMNS.payment)
      .eq("customer_user_id", userId)
      .order("created_at", { ascending: false }),
  ) as Payment[];
  const orderIds = [...new Set(payments.map((p) => p.order_id))];
  const orders = orderIds.length
    ? (check(await supabase.from("service_order").select("id, number").in("id", orderIds)) as {
        id: string;
        number: string;
      }[])
    : [];
  const numbers = new Map(orders.map((o) => [o.id, o.number]));
  return payments.map((p) => ({ ...p, order_number: numbers.get(p.order_id) ?? null }));
}

export interface PaymentView {
  payment: Payment;
  items: PaymentItem[];
  refunds: Refund[];
  order: Pick<ServiceOrder, "id" | "number" | "status"> | null;
  // The installment the payment paid and the plan's size (installments-v1).
  planInstallment: { row: PlanRow; count: number } | null;
}

export async function getPayment(
  supabase: Client,
  userId: string,
  id: string,
): Promise<PaymentView | null> {
  if (!isUuid(id)) return null;
  const payment = check(
    await supabase
      .from("payment")
      .select(BILLING_COLUMNS.payment)
      .eq("id", id)
      .eq("customer_user_id", userId)
      .maybeSingle(),
  ) as Payment | null;
  if (!payment) return null;
  const [items, refunds, order, plan] = await Promise.all([
    supabase
      .from("payment_item")
      .select(BILLING_COLUMNS.payment_item)
      .eq("payment_id", id)
      .order("line_no"),
    supabase
      .from("refund")
      .select(BILLING_COLUMNS.refund)
      .eq("payment_id", id)
      .order("requested_at"),
    supabase
      .from("service_order")
      .select("id, number, status")
      .eq("id", payment.order_id)
      .maybeSingle(),
    supabase
      .from("order_installment")
      .select(BILLING_COLUMNS.order_installment)
      .eq("order_id", payment.order_id)
      .order("seq"),
  ]);
  const rows = (check(plan) as OrderInstallment[]).map((r) => ({ id: r.id, row: planRowOf(r) }));
  const paid = rows.find((r) => r.id === payment.order_installment_id);
  return {
    payment,
    items: check(items) as PaymentItem[],
    refunds: check(refunds) as Refund[],
    order: check(order) as PaymentView["order"],
    planInstallment: paid ? { row: paid.row, count: rows.length } : null,
  };
}

// --------------------------------------------------------------------------
// Account
// --------------------------------------------------------------------------

export interface BillingProfileView {
  // The customer's org (private.customer_org_id): where the profile and the
  // portal's consent records (customer_set_consent) are written.
  orgId: string;
  hasProfile: boolean;
  identityNumberRequired: boolean;
  kind: "individual" | "company" | null;
  firstName: string | null;
  lastName: string | null;
  identityNumberMasked: string | null;
  companyTitle: string | null;
  taxOffice: string | null;
  taxNumber: string | null;
  address: string | null;
  district: string | null;
  city: string | null;
  postalCode: string | null;
  email: string | null;
  // Enough for customer_accept_quote and payment_begin.
  complete: boolean;
}

// The caller's billing profile (TCKN masked) through my_billing_profile; null
// for a user without a customer profile.
export async function getBillingProfile(supabase: Client): Promise<BillingProfileView | null> {
  const row = check(await supabase.rpc("my_billing_profile"))?.[0];
  if (!row) return null;
  const kind = row.kind === "individual" || row.kind === "company" ? row.kind : null;
  return {
    orgId: row.org_id,
    hasProfile: row.has_profile,
    identityNumberRequired: row.identity_number_required,
    kind,
    firstName: row.first_name ?? null,
    lastName: row.last_name ?? null,
    identityNumberMasked: row.identity_number_masked ?? null,
    companyTitle: row.company_title ?? null,
    taxOffice: row.tax_office ?? null,
    taxNumber: row.tax_number ?? null,
    address: row.address ?? null,
    district: row.district ?? null,
    city: row.city ?? null,
    postalCode: row.postal_code ?? null,
    email: row.email ?? null,
    // T13: the TCKN is asked at payment time, never stored with the profile.
    complete: row.has_profile,
  };
}

export interface ConsentView {
  orgId: string;
  kind: string;
  granted: boolean;
  textVersion: string;
  source: string;
  recordedAt: string;
}

// The latest record per consent kind of one org (my_consents returns one row
// per org and kind). Consents are per org: customer_accept_quote checks the
// quote's org, so records of another org must not count.
export async function getConsents(
  supabase: Client,
  orgId: string | null,
): Promise<Map<string, ConsentView>> {
  const rows = check(await supabase.rpc("my_consents")) ?? [];
  return latestConsents(rows, orgId);
}

export function latestConsents(
  rows: readonly {
    org_id: string;
    kind: string;
    granted: boolean;
    text_version: string;
    source: string;
    recorded_at: string;
  }[],
  orgId: string | null,
): Map<string, ConsentView> {
  const latest = new Map<string, ConsentView>();
  for (const r of rows) {
    if (r.org_id !== orgId) continue;
    const current = latest.get(r.kind);
    if (!current || current.recordedAt < r.recorded_at) {
      latest.set(r.kind, {
        orgId: r.org_id,
        kind: r.kind,
        granted: r.granted,
        textVersion: r.text_version,
        source: r.source,
        recordedAt: r.recorded_at,
      });
    }
  }
  return latest;
}

export function hasKvkkNotice(consents: Map<string, ConsentView>): boolean {
  return consents.get("kvkk_notice")?.granted === true;
}

// The production gate of the quote's org for the caller (legal_gate_status,
// T21). null when it cannot be read (the function is not deployed yet, or an
// error): the page then shows nothing and customer_accept_quote decides.
export async function getLegalGate(
  supabase: Client,
  orgId: string,
): Promise<{ active: boolean; reasons: LegalGateReason[] } | null> {
  try {
    const { data, error } = await supabase.rpc("legal_gate_status", { p_org_id: orgId });
    const row = Array.isArray(data) ? data[0] : null;
    if (error || !row) return null;
    return {
      active: row.active === true,
      reasons: (row.reasons ?? []).filter((r): r is LegalGateReason =>
        (LEGAL_GATE_REASONS as readonly string[]).includes(r),
      ),
    };
  } catch {
    return null;
  }
}

export interface ContactView {
  fullName: string;
  phone: string | null;
  email: string | null;
  contactPreference: string;
}

// Whether payment_begin finds an e-mail without the billing profile's: the
// contact e-mail (owner profile) or the account's. Without one, the billing
// e-mail is required for card payments.
export async function hasFallbackEmail(
  supabase: Client,
  accountEmail: string | null,
): Promise<boolean> {
  if (accountEmail?.trim()) return true;
  return !!(await getContact(supabase))?.email?.trim();
}

export async function getContact(supabase: Client): Promise<ContactView | null> {
  const row = check(await supabase.rpc("my_owner_profile"))?.[0];
  if (!row) return null;
  return {
    fullName: row.full_name,
    phone: row.phone ?? null,
    email: row.email ?? null,
    contactPreference: row.contact_preference,
  };
}

// --------------------------------------------------------------------------
// Home cards
// --------------------------------------------------------------------------

export interface CustomerSummary {
  openQuotes: Quote[];
  awaitingOrders: ServiceOrder[];
  draft: ServiceApplication | null;
  openApplications: ServiceApplication[];
  // IP14: the primary membership period (null: none) and the gardens.
  servicePeriod: ServicePeriod | null;
  gardens: CustomerGarden[];
}

export async function getCustomerSummary(
  supabase: Client,
  userId: string,
): Promise<CustomerSummary> {
  const [applications, quotes, orders, periods, gardens] = await Promise.all([
    listApplications(supabase, userId),
    listQuotes(supabase, userId),
    listOrders(supabase, userId),
    getServicePeriods(supabase),
    listMyGardens(supabase),
  ]);
  return {
    openQuotes: quotes.filter((q) => q.status === "issued"),
    awaitingOrders: orders.filter((o) => o.status === "awaiting_payment"),
    draft: applications.find((a) => a.status === "draft") ?? null,
    openApplications: applications.filter((a) => a.status === "submitted"),
    servicePeriod: periods.primary,
    gardens,
  };
}

// What is still to pay on an order: the money kept counts (paid minus
// refunded), as in the database's order arithmetic.
export function outstandingKurus(
  order: Pick<ServiceOrder, "total_kurus" | "paid_kurus" | "refunded_kurus">,
): number {
  return Math.max(0, order.total_kurus - (order.paid_kurus - order.refunded_kurus));
}

// The card attempt of an order that may still turn into money, as
// private.live_payment_attempt (§5.3): pending review, or initiated / expired
// with a token that is still valid; an initiated attempt without a token yet
// counts for 15 minutes. While one exists no new card attempt is offered, or
// the customer could be charged twice.
export function liveCardAttempt<
  T extends Pick<Payment, "provider" | "status" | "token_expires_at" | "initiated_at">,
>(payments: readonly T[], now: number = Date.now()): T | null {
  return (
    payments.find((p) => {
      if (p.provider === "manual") return false;
      if (p.status === "pending_review") return true;
      if (p.status !== "initiated" && p.status !== "expired") return false;
      if (p.token_expires_at) return Date.parse(p.token_expires_at) > now;
      return p.status === "initiated" && Date.parse(p.initiated_at) > now - 15 * 60_000;
    }) ?? null
  );
}

// The latest withdrawal of the customer's garden (T03): its number, how and
// when the notice arrived; the service card confirms it (H11 (c)).
export interface WithdrawalNotice {
  number: string;
  status: string;
  channel: string | null;
  receivedOn: string | null;
}

export async function latestWithdrawal(
  supabase: Client,
  userId: string,
  parcelId: string,
): Promise<WithdrawalNotice | null> {
  const { data } = await supabase
    .from("garden_removal")
    .select("number, status, notice_channel, notice_received_on, requested_at")
    .eq("parcel_id", parcelId)
    .eq("customer_user_id", userId)
    .eq("withdrawal", true)
    .neq("status", "cancelled")
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    number: data.number,
    status: data.status,
    channel: data.notice_channel,
    receivedOn: data.notice_received_on,
  };
}
