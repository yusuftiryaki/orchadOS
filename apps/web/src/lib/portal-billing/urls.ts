import { safeNextPath } from "@/app/giris/login-methods";
import { BILLING_ERRORS, type BillingError } from "@/lib/billing/errors";

// Addresses of the customer portal (docs/musteri-yonetimi.md §10) and the
// result a redirect after a save puts into the URL (`?bilgi=` / `?hata=`).
// Only listed codes are read back; anything else in the URL is ignored.

export const PORTAL_NOTICES = [
  "taslak_acildi",
  "paket_kaydedildi",
  "bahce_kaydedildi",
  "bahce_silindi",
  "basvuru_gonderildi",
  "basvuru_geri_cekildi",
  "teklif_kabul_edildi",
  "teklif_reddedildi",
  "revize_istendi",
  "aydinlatma_kaydedildi",
  "siparis_iptal_edildi",
  "fatura_kaydedildi",
  "iletisim_kaydedildi",
  "izin_kaydedildi",
  "hesap_vardi",
] as const;
export type PortalNotice = (typeof PORTAL_NOTICES)[number];

// Reason codes of the billing functions, the `payments` Edge Function
// (§8.4) and the payment callback's "not found" redirect.
export const PORTAL_ERRORS = [
  ...BILLING_ERRORS,
  "payments_disabled",
  "provider_error",
  "odeme_bulunamadi",
  "onay_eksik",
  "fatura_eposta_eksik",
] as const;
export type PortalError =
  | BillingError
  | "payments_disabled"
  | "provider_error"
  | "odeme_bulunamadi"
  | "onay_eksik"
  | "fatura_eposta_eksik";

type Result = { bilgi?: PortalNotice; hata?: PortalError; eksik?: string };

// What customer_submit_application found missing (its error detail).
export const INCOMPLETE_FIELDS = ["package_id", "gardens", "authorization_basis"] as const;

function withResult(path: string, result?: Result): string {
  const params = new URLSearchParams();
  if (result?.bilgi) params.set("bilgi", result.bilgi);
  if (result?.hata) params.set("hata", result.hata);
  if (result?.eksik && (INCOMPLETE_FIELDS as readonly string[]).includes(result.eksik)) {
    params.set("eksik", result.eksik);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export const portalHref = {
  home: (r?: Result) => withResult("/portal", r),
  applications: (r?: Result) => withResult("/portal/basvuru", r),
  newApplication: (r?: Result) => withResult("/portal/basvuru/yeni", r),
  application: (id: string, r?: Result) => withResult(`/portal/basvuru/${id}`, r),
  newGarden: (applicationId: string) => `/portal/basvuru/${applicationId}/bahce/yeni`,
  garden: (applicationId: string, gardenId: string) =>
    `/portal/basvuru/${applicationId}/bahce/${gardenId}`,
  quote: (id: string, r?: Result) => withResult(`/portal/teklif/${id}`, r),
  orders: (r?: Result) => withResult("/portal/siparis", r),
  order: (id: string, r?: Result) => withResult(`/portal/siparis/${id}`, r),
  payments: (r?: Result) => withResult("/portal/odeme", r),
  payment: (id: string, r?: Result) => withResult(`/portal/odeme/${id}`, r),
  account: (r?: Result) => withResult("/portal/hesap", r),
  // The billing profile; `back` is where to return after saving (a quote).
  billing: (back?: string | null, r?: Result) => {
    const base = withResult("/portal/hesap/fatura", r);
    if (!back) return base;
    return `${base}${base.includes("?") ? "&" : "?"}geri=${encodeURIComponent(back)}`;
  },
  consents: (r?: Result) => withResult("/portal/hesap/izinler", r),
  receipt: (paymentId: string) => `/makbuz/${paymentId}`,
};

type Params = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function readPortalResult(params: Params): {
  notice: PortalNotice | null;
  error: PortalError | null;
  missing: (typeof INCOMPLETE_FIELDS)[number] | null;
} {
  const notice = first(params.bilgi);
  const error = first(params.hata);
  const missing = first(params.eksik);
  return {
    missing: (INCOMPLETE_FIELDS as readonly string[]).includes(missing ?? "")
      ? (missing as (typeof INCOMPLETE_FIELDS)[number])
      : null,
    notice: (PORTAL_NOTICES as readonly string[]).includes(notice ?? "")
      ? (notice as PortalNotice)
      : null,
    error: (PORTAL_ERRORS as readonly string[]).includes(error ?? "")
      ? (error as PortalError)
      : null,
  };
}

// The `?geri=` return address of the billing profile form: a path of this
// site under /portal, else null (an open redirect is never followed).
export function safeBackPath(value: unknown): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" || raw === "") return null;
  const path = safeNextPath(raw);
  if (path === "/" || /[\\\s]/.test(path)) return null;
  return path === "/portal" || path.startsWith("/portal/") ? path : null;
}
