import { BILLING_COLUMNS } from "@/lib/billing/columns";
import type {
  ApplicationGarden,
  Payment,
  PaymentItem,
  Quote,
  QuoteItem,
  Refund,
  ServiceApplication,
  ServiceOrder,
  ServiceOrderItem,
} from "@/lib/billing/types";
import type { Position } from "@/lib/map/geo";
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
  quote: Pick<Quote, "id" | "number" | "package_name"> | null;
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
  const [items, payments, quote] = await Promise.all([
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
      .select("id, number, package_name")
      .eq("id", order.quote_id)
      .maybeSingle(),
  ]);
  return {
    order,
    items: check(items) as ServiceOrderItem[],
    payments: check(payments) as Payment[],
    quote: check(quote) as OrderView["quote"],
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
}

export async function getPaymentInstructions(
  supabase: Client,
  orderId: string,
): Promise<PaymentInstructions | null> {
  const { data, error } = await supabase.rpc("customer_payment_instructions", {
    p_order_id: orderId,
  });
  const row = error ? undefined : data?.[0];
  if (!row) return null;
  return {
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
  const [items, refunds, order] = await Promise.all([
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
  ]);
  return {
    payment,
    items: check(items) as PaymentItem[],
    refunds: check(refunds) as Refund[],
    order: check(order) as PaymentView["order"],
  };
}

// --------------------------------------------------------------------------
// Account
// --------------------------------------------------------------------------

export interface BillingProfileView {
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
    complete: row.has_profile && (!row.identity_number_required || !!row.identity_number_masked),
  };
}

export interface ConsentView {
  kind: string;
  granted: boolean;
  textVersion: string;
  source: string;
  recordedAt: string;
}

// The latest record per consent kind (my_consents).
export async function getConsents(supabase: Client): Promise<Map<string, ConsentView>> {
  const rows = check(await supabase.rpc("my_consents")) ?? [];
  const latest = new Map<string, ConsentView>();
  for (const r of rows) {
    const current = latest.get(r.kind);
    if (!current || current.recordedAt < r.recorded_at) {
      latest.set(r.kind, {
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

export interface ContactView {
  fullName: string;
  phone: string | null;
  email: string | null;
  contactPreference: string;
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
  hasAnything: boolean;
}

export async function getCustomerSummary(
  supabase: Client,
  userId: string,
): Promise<CustomerSummary> {
  const [applications, quotes, orders] = await Promise.all([
    listApplications(supabase, userId),
    listQuotes(supabase, userId),
    listOrders(supabase, userId),
  ]);
  return {
    openQuotes: quotes.filter((q) => q.status === "issued"),
    awaitingOrders: orders.filter((o) => o.status === "awaiting_payment"),
    draft: applications.find((a) => a.status === "draft") ?? null,
    openApplications: applications.filter((a) => a.status === "submitted"),
    hasAnything: applications.length + orders.length > 0,
  };
}

// What is still to pay on an order: the money kept counts (paid minus
// refunded), as in the database's order arithmetic.
export function outstandingKurus(
  order: Pick<ServiceOrder, "total_kurus" | "paid_kurus" | "refunded_kurus">,
): number {
  return Math.max(0, order.total_kurus - (order.paid_kurus - order.refunded_kurus));
}
