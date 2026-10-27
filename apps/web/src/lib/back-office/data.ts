import { BILLING_COLUMNS } from "@/lib/billing/columns";
import type {
  ApplicationGarden,
  PriceList,
  PriceListItem,
  Quote,
  QuoteItem,
  ServiceApplication,
  ServiceOrder,
  ServiceOrderItem,
  ServicePackage,
  Payment,
  PaymentItem,
} from "@/lib/billing/types";
import type { Database, Json } from "@/lib/database.types";
import { isPoint, isPolygon, type Position } from "@/lib/map/geo";
import type { OpsOrg } from "@/lib/operations/data";
import { isUuid } from "@/lib/supabase/query";
import type { Client } from "@/lib/supabase/types";

// Reads of the back office screens (docs/musteri-yonetimi.md §11), as the
// signed-in ops user. Tables are read with BILLING_COLUMNS (never "*");
// internal columns come only from ops_billing_internal, personal data only
// from the ops_* functions.

type Functions = Database["public"]["Functions"];
type Returns<F extends keyof Functions> = Functions[F]["Returns"];
type Row<F extends keyof Functions> = Returns<F> extends (infer R)[] ? R : never;

export type BillingSummary = Row<"ops_billing_summary">;
export type CustomerRow = Row<"ops_customers">;
export type ApplicationRow = Row<"ops_applications">;
export type OrderRow = Row<"ops_orders">;
export type PaymentRow = Row<"ops_payments">;
export type RefundRow = Row<"ops_refunds">;
export type AuditRow = Row<"ops_audit_events">;
export type PaymentEvent = Row<"ops_payment_events">;
export type QuotePreviewLine = Row<"ops_preview_quote">;
export type BillingProfile = Row<"ops_billing_profile">;
export type ConsentRow = Row<"ops_customer_consents">;
export type GardenDetail = Row<"ops_application_garden_detail">;
export type BillingSetting = Row<"ops_billing_setting">;

// {id, name} of a user in ops_billing_internal.
export interface UserRef {
  id: string;
  name: string | null;
}
export type Internal = Record<string, string | boolean | UserRef | null>;

// The data of a response (a function's rows, or a maybeSingle row that the
// caller casts back to nullable); throws the error.
function check<T>(result: { data: T; error: unknown }): NonNullable<T> {
  if (result.error) throw result.error;
  return result.data as NonNullable<T>;
}

// The org a screen works in: the one asked for, else the first.
export function chooseOrg(orgs: OpsOrg[], wanted?: string | null): OpsOrg | null {
  return orgs.find((o) => o.id === wanted) ?? orgs[0] ?? null;
}

// Rows of every ops org of the user, for the lists.
async function eachOrg<T>(orgs: OpsOrg[], read: (orgId: string) => Promise<T[]>): Promise<T[]> {
  return (await Promise.all(orgs.map((o) => read(o.id)))).flat();
}

export async function internalOf(
  supabase: Client,
  entityType: "application" | "application_garden" | "quote" | "order" | "payment" | "refund",
  id: string,
): Promise<Internal> {
  const data = check(
    await supabase.rpc("ops_billing_internal", { p_entity_type: entityType, p_entity_id: id }),
  );
  return (data ?? {}) as Internal;
}

export const userName = (ref: unknown): string | null =>
  ref && typeof ref === "object" && "name" in ref
    ? ((ref as UserRef).name ?? (ref as UserRef).id)
    : null;

// ---------------------------------------------------------------------------
// Dashboard and customers
// ---------------------------------------------------------------------------

export async function billingSummary(
  supabase: Client,
  orgs: OpsOrg[],
): Promise<BillingSummary | null> {
  const rows = await eachOrg(orgs, async (orgId) =>
    check(await supabase.rpc("ops_billing_summary", { p_org_id: orgId })),
  );
  if (rows.length === 0) return null;
  const sum = { ...rows[0] };
  for (const row of rows.slice(1)) {
    for (const key of Object.keys(sum) as (keyof BillingSummary)[]) sum[key] += row[key];
  }
  return sum;
}

export async function listCustomers(
  supabase: Client,
  orgs: OpsOrg[],
  query: string | null,
): Promise<CustomerRow[]> {
  return eachOrg(orgs, async (orgId) =>
    check(
      await supabase.rpc("ops_customers", {
        p_org_id: orgId,
        ...(query ? { p_query: query } : {}),
        p_limit: 1000,
      }),
    ),
  );
}

export interface CustomerAccount {
  profile: BillingProfile | null;
  consents: ConsentRow[];
  applications: ApplicationRow[];
  orders: OrderRow[];
  payments: PaymentRow[];
}

// The "Müşteri hesabı" panel of an owner: billing profile (TCKN masked),
// consent history, applications, orders and payments.
export async function customerAccount(
  supabase: Client,
  orgId: string,
  userId: string,
): Promise<CustomerAccount> {
  const [profile, consents, applications, orders, payments] = await Promise.all([
    supabase.rpc("ops_billing_profile", { p_org_id: orgId, p_user_id: userId }),
    supabase.rpc("ops_customer_consents", { p_org_id: orgId, p_user_id: userId }),
    supabase.rpc("ops_applications", { p_org_id: orgId, p_limit: 1000 }),
    supabase.rpc("ops_orders", { p_org_id: orgId, p_customer_user_id: userId }),
    supabase.rpc("ops_payments", { p_org_id: orgId, p_limit: 1000 }),
  ]);
  return {
    profile: check(profile)[0] ?? null,
    consents: check(consents),
    applications: check(applications).filter((a) => a.customer_user_id === userId),
    orders: check(orders),
    payments: check(payments).filter((p) => p.customer_user_id === userId),
  };
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

export async function listApplications(
  supabase: Client,
  orgs: OpsOrg[],
  status: string | null,
): Promise<ApplicationRow[]> {
  const rows = await eachOrg(orgs, async (orgId) =>
    check(
      await supabase.rpc("ops_applications", {
        p_org_id: orgId,
        ...(status ? { p_status: status } : {}),
      }),
    ),
  );
  return rows.sort((a, b) =>
    (b.submitted_at ?? b.created_at).localeCompare(a.submitted_at ?? a.created_at),
  );
}

// Geometry columns as GeoJSON (PostgREST cast), the rest as granted.
const GARDEN_COLUMNS = BILLING_COLUMNS.application_garden.replace(
  "position, position_uncertainty_m, boundary",
  "position:position::json, position_uncertainty_m, boundary:boundary::json",
);

export type Garden = Omit<ApplicationGarden, "position" | "boundary"> & {
  position: Position | null;
  boundary: Position[] | null;
};

function toGarden(row: Record<string, unknown>): Garden {
  const position: unknown = row.position;
  const boundary: unknown = row.boundary;
  return {
    ...(row as unknown as ApplicationGarden),
    position: isPoint(position) ? [position.coordinates[0], position.coordinates[1]] : null,
    boundary: isPolygon(boundary)
      ? boundary.coordinates[0].slice(0, -1).map(([lon, lat]) => [lon, lat] as Position)
      : null,
  };
}

export interface ApplicationView {
  application: ServiceApplication;
  customerName: string | null;
  packageName: string | null;
  gardens: Garden[];
  quotes: Quote[];
  internal: Internal;
}

export async function getApplication(
  supabase: Client,
  id: string,
): Promise<ApplicationView | null> {
  if (!isUuid(id)) return null;
  const application = check(
    await supabase
      .from("service_application")
      .select(BILLING_COLUMNS.service_application)
      .eq("id", id)
      .maybeSingle(),
  ) as ServiceApplication | null;
  if (!application) return null;
  const [gardens, quotes, internal, list] = await Promise.all([
    supabase
      .from("application_garden")
      .select(GARDEN_COLUMNS)
      .eq("application_id", id)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("quote")
      .select(BILLING_COLUMNS.quote)
      .eq("application_id", id)
      .order("issued_at", { ascending: false }),
    internalOf(supabase, "application", id),
    supabase.rpc("ops_applications", {
      p_org_id: application.org_id,
      p_status: application.status,
      p_limit: 1000,
    }),
  ]);
  const summary = check(list).find((a) => a.id === id);
  return {
    application,
    customerName: summary?.customer_name ?? null,
    packageName: summary?.package_name ?? null,
    gardens: (check(gardens) as unknown as Record<string, unknown>[]).map(toGarden),
    quotes: check(quotes) as unknown as Quote[],
    internal,
  };
}

export interface GardenView {
  garden: Garden;
  detail: GardenDetail | null;
  internal: Internal;
}

export async function getGarden(supabase: Client, gardenId: string): Promise<GardenView | null> {
  if (!isUuid(gardenId)) return null;
  const row = check(
    await supabase
      .from("application_garden")
      .select(GARDEN_COLUMNS)
      .eq("id", gardenId)
      .maybeSingle(),
  );
  if (!row) return null;
  const [detail, internal] = await Promise.all([
    supabase.rpc("ops_application_garden_detail", { p_garden_id: gardenId }),
    internalOf(supabase, "application_garden", gardenId),
  ]);
  return {
    garden: toGarden(row as unknown as Record<string, unknown>),
    detail: check(detail)[0] ?? null,
    internal,
  };
}

// The quote ops would issue now; null with the reason when it cannot be
// computed (gardens not verified, no price list).
export async function previewQuote(
  supabase: Client,
  applicationId: string,
  discountBp: number,
): Promise<{ lines: QuotePreviewLine[] } | { error: string }> {
  const { data, error } = await supabase.rpc("ops_preview_quote", {
    p_application_id: applicationId,
    p_discount_bp: discountBp,
  });
  if (error) return { error: error.message };
  return { lines: data };
}

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

export interface QuoteView {
  quote: Quote;
  items: QuoteItem[];
  internal: Internal;
  customerName: string | null;
  orderId: string | null;
}

export async function getQuote(supabase: Client, id: string): Promise<QuoteView | null> {
  if (!isUuid(id)) return null;
  const quote = check(
    await supabase.from("quote").select(BILLING_COLUMNS.quote).eq("id", id).maybeSingle(),
  ) as Quote | null;
  if (!quote) return null;
  const [items, internal, order, customers] = await Promise.all([
    supabase
      .from("quote_item")
      .select(BILLING_COLUMNS.quote_item)
      .eq("quote_id", id)
      .order("line_no"),
    internalOf(supabase, "quote", id),
    supabase.from("service_order").select("id").eq("quote_id", id).maybeSingle(),
    supabase.rpc("ops_customers", { p_org_id: quote.org_id, p_limit: 1000 }),
  ]);
  return {
    quote,
    items: check(items) as QuoteItem[],
    internal,
    customerName:
      check(customers).find((c) => c.user_id === quote.customer_user_id)?.full_name ?? null,
    orderId: check(order)?.id ?? null,
  };
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export async function listOrders(
  supabase: Client,
  orgs: OpsOrg[],
  status: string | null,
): Promise<OrderRow[]> {
  const rows = await eachOrg(orgs, async (orgId) =>
    check(
      await supabase.rpc("ops_orders", {
        p_org_id: orgId,
        ...(status ? { p_status: status } : {}),
        p_limit: 1000,
      }),
    ),
  );
  return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export interface OrderView {
  order: ServiceOrder;
  summary: OrderRow | null;
  items: (ServiceOrderItem & { parcelName: string | null })[];
  payments: PaymentRow[];
  audit: AuditRow[];
  internal: Internal;
}

export async function getOrder(supabase: Client, id: string): Promise<OrderView | null> {
  if (!isUuid(id)) return null;
  const order = check(
    await supabase
      .from("service_order")
      .select(BILLING_COLUMNS.service_order)
      .eq("id", id)
      .maybeSingle(),
  ) as ServiceOrder | null;
  if (!order) return null;
  const [items, payments, audit, internal, list] = await Promise.all([
    supabase
      .from("service_order_item")
      .select(BILLING_COLUMNS.service_order_item)
      .eq("order_id", id)
      .order("line_no"),
    supabase.rpc("ops_payments", { p_org_id: order.org_id, p_order_id: id }),
    supabase.rpc("ops_audit_events", {
      p_org_id: order.org_id,
      p_entity_type: "order",
      p_entity_id: id,
    }),
    internalOf(supabase, "order", id),
    supabase.rpc("ops_orders", {
      p_org_id: order.org_id,
      p_customer_user_id: order.customer_user_id,
    }),
  ]);
  const rows = check(items) as ServiceOrderItem[];
  const parcelIds = rows.map((r) => r.parcel_id).filter((p): p is string => !!p);
  const parcels = parcelIds.length
    ? check(await supabase.from("parcel").select("id, name").in("id", parcelIds))
    : [];
  const names = new Map(parcels.map((p) => [p.id, p.name]));
  return {
    order,
    summary: check(list).find((o) => o.id === id) ?? null,
    items: rows.map((r) => ({
      ...r,
      parcelName: r.parcel_id ? (names.get(r.parcel_id) ?? null) : null,
    })),
    payments: check(payments),
    audit: check(audit),
    internal,
  };
}

// ---------------------------------------------------------------------------
// Payments and refunds
// ---------------------------------------------------------------------------

export async function listPayments(
  supabase: Client,
  orgs: OpsOrg[],
  filters: { status: string | null; provider: string | null },
): Promise<PaymentRow[]> {
  const rows = await eachOrg(orgs, async (orgId) =>
    check(
      await supabase.rpc("ops_payments", {
        p_org_id: orgId,
        ...(filters.status ? { p_status: filters.status } : {}),
        p_limit: 1000,
      }),
    ),
  );
  return rows
    .filter((p) => !filters.provider || p.provider === filters.provider)
    .sort((a, b) => b.initiated_at.localeCompare(a.initiated_at));
}

export interface PaymentView {
  payment: Payment;
  summary: PaymentRow | null;
  orderStatus: string | null;
  items: PaymentItem[];
  events: PaymentEvent[];
  refunds: RefundRow[];
  internal: Internal;
}

export async function getPayment(supabase: Client, id: string): Promise<PaymentView | null> {
  if (!isUuid(id)) return null;
  const payment = check(
    await supabase.from("payment").select(BILLING_COLUMNS.payment).eq("id", id).maybeSingle(),
  ) as Payment | null;
  if (!payment) return null;
  const [items, events, refunds, internal, list, order] = await Promise.all([
    supabase
      .from("payment_item")
      .select(BILLING_COLUMNS.payment_item)
      .eq("payment_id", id)
      .order("line_no"),
    supabase.rpc("ops_payment_events", { p_payment_id: id }),
    supabase.rpc("ops_refunds", { p_org_id: payment.org_id, p_payment_id: id }),
    internalOf(supabase, "payment", id),
    supabase.rpc("ops_payments", { p_org_id: payment.org_id, p_order_id: payment.order_id }),
    supabase.from("service_order").select("status").eq("id", payment.order_id).maybeSingle(),
  ]);
  return {
    payment,
    summary: check(list).find((p) => p.id === id) ?? null,
    orderStatus: (check(order) as { status: string } | null)?.status ?? null,
    items: check(items) as PaymentItem[],
    events: check(events),
    refunds: check(refunds),
    internal,
  };
}

// Open work first: requested, failed and uncertain refunds, then the rest;
// newest first within each group.
export function refundOrder(r: RefundRow): number {
  if (r.status === "requested") return 0;
  if (r.status === "failed") return 1;
  if (r.uncertain) return 2;
  if (r.status === "processing") return 3;
  return 4;
}

export async function listRefunds(supabase: Client, orgs: OpsOrg[]): Promise<RefundRow[]> {
  const rows = await eachOrg(orgs, async (orgId) =>
    check(await supabase.rpc("ops_refunds", { p_org_id: orgId, p_limit: 1000 })),
  );
  return rows.sort(
    (a, b) => refundOrder(a) - refundOrder(b) || b.requested_at.localeCompare(a.requested_at),
  );
}

// Kinds of refunds just requested: card ones go to the payments function.
export async function refundKinds(
  supabase: Client,
  ids: string[],
): Promise<{ id: string; kind: string }[]> {
  if (ids.length === 0) return [];
  return check(await supabase.from("refund").select("id, kind").in("id", ids));
}

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------

export interface PricesView {
  packages: ServicePackage[];
  lists: PriceList[];
  inForceId: string | null;
}

// The list in force on a day: the highest published version with valid_from
// on or before it (docs/musteri-yonetimi.md §6.6).
export function listInForce(lists: PriceList[], today: string): PriceList | null {
  return (
    lists
      .filter((l) => l.status === "published" && l.valid_from != null && l.valid_from <= today)
      .sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0] ?? null
  );
}

export async function getPrices(
  supabase: Client,
  orgId: string,
  today: string,
): Promise<PricesView> {
  const [packages, lists] = await Promise.all([
    supabase
      .from("service_package")
      .select(BILLING_COLUMNS.service_package)
      .eq("org_id", orgId)
      .order("sort_order")
      .order("code"),
    supabase
      .from("price_list")
      .select(BILLING_COLUMNS.price_list)
      .eq("org_id", orgId)
      .order("version", { ascending: false, nullsFirst: true })
      .order("created_at", { ascending: false }),
  ]);
  const all = check(lists) as PriceList[];
  return {
    packages: check(packages) as ServicePackage[],
    lists: all,
    inForceId: listInForce(all, today)?.id ?? null,
  };
}

export async function getPackage(supabase: Client, id: string): Promise<ServicePackage | null> {
  if (!isUuid(id)) return null;
  return check(
    await supabase
      .from("service_package")
      .select(BILLING_COLUMNS.service_package)
      .eq("id", id)
      .maybeSingle(),
  ) as ServicePackage | null;
}

export interface PriceListView {
  list: PriceList;
  items: PriceListItem[];
  packages: ServicePackage[];
}

export async function getPriceList(supabase: Client, id: string): Promise<PriceListView | null> {
  if (!isUuid(id)) return null;
  const list = check(
    await supabase.from("price_list").select(BILLING_COLUMNS.price_list).eq("id", id).maybeSingle(),
  ) as PriceList | null;
  if (!list) return null;
  const [items, packages] = await Promise.all([
    supabase
      .from("price_list_item")
      .select(BILLING_COLUMNS.price_list_item)
      .eq("price_list_id", id),
    supabase
      .from("service_package")
      .select(BILLING_COLUMNS.service_package)
      .eq("org_id", list.org_id)
      .order("sort_order")
      .order("code"),
  ]);
  return {
    list,
    items: check(items) as PriceListItem[],
    packages: check(packages) as ServicePackage[],
  };
}

// ---------------------------------------------------------------------------
// Audit log and settings
// ---------------------------------------------------------------------------

export async function listAudit(
  supabase: Client,
  orgId: string,
  filters: { entityType: string | null; entityId: string | null; actionPrefix: string | null },
): Promise<AuditRow[]> {
  return check(
    await supabase.rpc("ops_audit_events", {
      p_org_id: orgId,
      ...(filters.entityType ? { p_entity_type: filters.entityType } : {}),
      ...(filters.entityId && isUuid(filters.entityId) ? { p_entity_id: filters.entityId } : {}),
      ...(filters.actionPrefix ? { p_action_prefix: filters.actionPrefix } : {}),
      p_limit: 500,
    }),
  );
}

export async function getSetting(supabase: Client, orgId: string): Promise<BillingSetting | null> {
  return check(await supabase.rpc("ops_billing_setting", { p_org_id: orgId }))[0] ?? null;
}

// Owner parcels of a customer in an org (parcel quotes).
export async function ownerParcels(
  supabase: Client,
  userId: string,
): Promise<{ id: string; name: string; orgId: string; areaM2: number | null }[]> {
  const rows = check(
    await supabase
      .from("parcel_access")
      .select("parcel_id, parcel(name, org_id, estimated_area_m2)")
      .eq("user_id", userId)
      .eq("role", "owner"),
  );
  return rows
    .filter((r) => r.parcel)
    .map((r) => ({
      id: r.parcel_id,
      name: r.parcel!.name,
      orgId: r.parcel!.org_id,
      areaM2: r.parcel!.estimated_area_m2,
    }));
}

export type { Json };
