import { BILLING_ERRORS, type BillingError } from "@/lib/billing/errors";

// Addresses of the back office screens under /operasyon (docs/musteri-yonetimi.md
// §11) and the result notices carried in them (?bilgi=<notice>, ?hata=<error>).
// Only known codes are read back, so a URL cannot put arbitrary text on a page.

export const BO_NOTICES = [
  "garden_verified",
  "quote_issued",
  "application_rejected",
  "payment_recorded",
  "unpaid_visit_allowed",
  "due_extended",
  "order_cancelled",
  "order_terminated",
  "review_resolved",
  "payment_voided",
  "refund_requested",
  "refund_processed",
  "refund_processing_failed",
  "refund_completed",
  "refund_cancelled",
  "refund_resolved",
  "package_saved",
  "draft_created",
  "draft_saved",
  "price_list_published",
  "draft_deleted",
  "settings_saved",
  // IP15 (docs/MVP.md Module 6)
  "service_prices_saved",
  // IP14 (docs/bahce-yonetimi.md §12)
  "garden_linked",
  "garden_unlinked",
  "garden_withdrawn",
  "removal_requested",
  "withdrawal_recorded",
  "removal_scheduled",
  "removal_completed",
  "removal_cancelled",
] as const;
export type BoNotice = (typeof BO_NOTICES)[number];

// Errors of the billing functions, plus the payments Edge Function being
// unreachable (404 or 5xx).
export const BO_ERRORS = [...BILLING_ERRORS, "payments_unreachable"] as const;
export type BoError = (typeof BO_ERRORS)[number];

export interface BoResult {
  notice?: BoNotice;
  error?: BoError;
}

type Query = Record<string, string | null | undefined>;

function build(path: string, query: Query = {}, result: BoResult = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v) q.set(k, v);
  if (result.notice) q.set("bilgi", result.notice);
  if (result.error) q.set("hata", result.error);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

export const boHref = {
  // No search term here: it is personal data (name, phone, e-mail) and is
  // posted, never put in a URL.
  customers: (query: { kaynak?: string | null } = {}) => build("/operasyon/sahip", query),
  customer: (profileId: string, result?: BoResult) =>
    build(`/operasyon/sahip/${profileId}`, {}, result),
  applications: (query: { durum?: string | null } = {}) => build("/operasyon/basvuru", query),
  application: (id: string, result?: BoResult) => build(`/operasyon/basvuru/${id}`, {}, result),
  applicationGarden: (applicationId: string, gardenId: string, result?: BoResult) =>
    build(`/operasyon/basvuru/${applicationId}/bahce/${gardenId}`, {}, result),
  quote: (id: string, result?: BoResult) => build(`/operasyon/teklif/${id}`, {}, result),
  // ?sahip=<profile>: parcel quote; ?siparis=<order>: renewal; ?ek=<base
  // order> (with an optional &siparis=<order> to merge): add-on quote for
  // existing parcels (IP14).
  newQuote: (
    query: { sahip?: string | null; siparis?: string | null; ek?: string | null },
    result?: BoResult,
  ) => build("/operasyon/teklif/yeni", query, result),
  orders: (query: { durum?: string | null } = {}) => build("/operasyon/siparis", query),
  order: (id: string, result?: BoResult) => build(`/operasyon/siparis/${id}`, {}, result),
  payments: (query: { durum?: string | null; yontem?: string | null } = {}) =>
    build("/operasyon/odeme", query),
  payment: (id: string, result?: BoResult) => build(`/operasyon/odeme/${id}`, {}, result),
  refunds: (result?: BoResult) => build("/operasyon/iade", {}, result),
  // Garden removals (IP14): the queue (open by default) and one removal.
  removals: (query: { durum?: string | null } = {}) => build("/operasyon/cikarma", query),
  removal: (id: string, result?: BoResult) => build(`/operasyon/cikarma/${id}`, {}, result),
  // `org` keeps the org of a multi-org ops user across links and redirects.
  prices: (result?: BoResult, org?: string | null) => build("/operasyon/fiyat", { org }, result),
  priceList: (id: string, result?: BoResult) => build(`/operasyon/fiyat/liste/${id}`, {}, result),
  packageForm: (id?: string, org?: string | null) =>
    id ? `/operasyon/fiyat/paket/${id}` : build("/operasyon/fiyat/paket/yeni", { org }),
  audit: (
    query: {
      org?: string | null;
      tur?: string | null;
      kayit?: string | null;
      eylem?: string | null;
    } = {},
  ) => build("/operasyon/denetim-kaydi", query),
  settings: (result?: BoResult, org?: string | null) =>
    build("/operasyon/ayarlar", { org }, result),
  receipt: (paymentId: string) => `/makbuz/${paymentId}`,
};

type Params = Record<string, string | string[] | undefined>;

export const firstParam = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function readBoResult(params: Params): BoResult {
  const notice = firstParam(params.bilgi);
  const error = firstParam(params.hata);
  return {
    notice: (BO_NOTICES as readonly string[]).includes(notice ?? "")
      ? (notice as BoNotice)
      : undefined,
    error: (BO_ERRORS as readonly string[]).includes(error ?? "") ? (error as BoError) : undefined,
  };
}

// A filter value from the URL, kept only when it is one of the allowed ones.
export function pick<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[],
): T | null {
  const v = firstParam(value);
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

export type { BillingError };
