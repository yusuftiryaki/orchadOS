// Message texts and the retry policy, shared by send-notifications and
// send-sms. Pure TypeScript without imports or Deno APIs: the web app's unit
// tests (apps/web/src/lib/notifications/messaging.test.ts) import this file.
//
// Template variables are limited to the parcel name, the visit day, the
// portal path and a document number (KVKK: no names, no finding text, no
// amounts or reasons; the database checks the keys).

export type Channel = "sms" | "whatsapp";
export type ReportTemplate = "report_ready" | "critical_finding";
// The visit date notice (kararlar.md H15, contract 8A/1, at least 3 days
// ahead) with the short notice for people working in the garden and the
// /bahcede-bulunanlar link (H01): the day and the portal path; the parcel
// name is optional ("bahçenizin").
export type VisitTemplate = "visit_scheduled";
// Customer account messages (docs/musteri-yonetimi.md §12): ref is the
// document number (T-…, B-…, M-…, I-…, S-…). Garden removal messages
// (docs/bahce-yonetimi.md §10) refer to the removal (C-…) and may name the
// parcel; without its name the text says "bahçeniz". withdrawal_received
// confirms a withdrawal notice (C-…, kararlar.md H11 (c)); contract_ready
// links the order's contract documents (S-…, H12); addon_order_closed tells
// that an add-on order was cancelled because its period closed (S-…, 8D/6).
// garden_transfer_reports tells the owner of a garden leaving by transfer to
// download the reports before the exit day (C-…, H22, contract 12/4).
export type GardenTemplate =
  | "garden_removal_scheduled"
  | "garden_removal_rescheduled"
  | "garden_removal_cancelled"
  | "garden_removal_completed"
  | "garden_access_ending"
  | "garden_transfer_reports"
  | "withdrawal_received";
export type AccountTemplate =
  | "quote_ready"
  | "application_rejected"
  | "payment_received"
  | "refund_completed"
  | "payment_reminder"
  | "contract_ready"
  | "addon_order_closed"
  | GardenTemplate;
// The co-owner invitation (kararlar.md T15, H32): parcel name and portal path
// only; the KVKK notice link is the site's fixed /kvkk page.
export type InviteTemplate = "viewer_invited";
export type Template = ReportTemplate | VisitTemplate | AccountTemplate | InviteTemplate;

export interface TemplateVars {
  parcel_name?: unknown;
  date?: unknown;
  path?: unknown;
  ref?: unknown;
}

// Document number prefix each account template refers to.
const ACCOUNT_REF_PREFIX: Record<AccountTemplate, string> = {
  quote_ready: "T",
  application_rejected: "B",
  payment_received: "M",
  refund_completed: "I",
  payment_reminder: "S",
  contract_ready: "S",
  addon_order_closed: "S",
  garden_removal_scheduled: "C",
  garden_removal_rescheduled: "C",
  garden_removal_cancelled: "C",
  garden_removal_completed: "C",
  garden_access_ending: "C",
  garden_transfer_reports: "C",
  withdrawal_received: "C",
};

const isAccountTemplate = (template: string): template is AccountTemplate =>
  Object.prototype.hasOwnProperty.call(ACCOUNT_REF_PREFIX, template);

function renderAccount(template: AccountTemplate, ref: string, link: string, parcel: string): string {
  // "{parcel} adlı bahçenizin" / "bahçenizin", "{parcel} adlı bahçeniz" / "bahçeniz".
  const gardenOf = parcel ? `${parcel} adlı bahçenizin` : "bahçenizin";
  const garden = parcel ? `${parcel} adlı bahçeniz` : "bahçeniz";
  switch (template) {
    case "quote_ready":
      return `orchadOS teklifiniz (${ref}) hazır. İnceleyip onaylayabilirsiniz: ${link}`;
    case "application_rejected":
      return `${ref} numaralı başvurunuz sonuçlandı. Ayrıntı: ${link}`;
    case "payment_received":
      return `${ref} numaralı ödemeniz alındı, teşekkür ederiz. Makbuz: ${link}`;
    case "refund_completed":
      return `${ref} numaralı iadeniz yapıldı; hesabınıza yansıması bankanıza göre birkaç gün sürebilir: ${link}`;
    case "payment_reminder":
      return `${ref} numaralı siparişinizin ödemesi bekleniyor: ${link}`;
    case "contract_ready":
      return `orchadOS: ${ref} numaralı siparişinizin sözleşmesi ve ön bilgilendirme formu portalınızda: ${link}`;
    case "addon_order_closed":
      return `orchadOS: ${ref} numaralı ek siparişiniz, hizmet dönemi kapandığı için iptal edildi. Ödediğiniz tutar 14 gün içinde aynı yöntemle, masrafsız iade edilir: ${link}`;
    case "garden_removal_scheduled":
      return `orchadOS: ${gardenOf} hizmetten çıkışı planlandı (${ref}). Çıkış tarihi ve ayrıntılar: ${link}`;
    case "garden_removal_rescheduled":
      return `orchadOS: ${gardenOf} hizmetten çıkış tarihi değişti (${ref}). Yeni tarih ve ayrıntılar: ${link}`;
    case "garden_removal_cancelled":
      return `orchadOS: ${garden} için çıkarma işlemi iptal edildi (${ref}); bahçeniz hizmette kalıyor. Ayrıntılar: ${link}`;
    case "garden_removal_completed":
      return `orchadOS: ${garden} hizmetten çıkarıldı (${ref}). Raporlarınız silinmedi; erişim süresi ve iade bilgisi: ${link}`;
    case "withdrawal_received":
      return `orchadOS: ${garden} için cayma bildiriminiz alındı (${ref}). İade ve ayrıntılar: ${link}`;
    case "garden_access_ending":
      return `orchadOS: hizmetten çıkan ${gardenOf} raporlarına erişim 7 gün sonra kapanacak (${ref}). Raporları indirmek için: ${link}`;
    case "garden_transfer_reports":
      return `orchadOS: ${gardenOf} devir nedeniyle hizmetten çıkışı planlandı (${ref}). Raporlara erişim çıkış gününde kapanır; o güne kadar raporlarınızı indirebilirsiniz, sonrasında kopyası talebiniz üzerine verilir: ${link}`;
  }
}

const MONTHS_TR = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

// "2026-10-14" -> "14 Ekim". The year is left out: reports are recent.
export function formatDayTr(isoDay: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay);
  if (!match) return null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${day} ${MONTHS_TR[month - 1]}`;
}

// Base URL of the portal + a portal path. Only /portal and /portal/... paths
// are linked (a removal without an access window links the portal's home).
export function portalLink(baseUrl: string, path: string): string | null {
  if (!/^\/portal(\/[A-Za-z0-9/_-]*)?$/.test(path)) return null;
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return null;
  }
  if (base.protocol !== "https:" && base.protocol !== "http:") return null;
  return base.origin + base.pathname.replace(/\/+$/, "") + path;
}

// Base URL + a fixed site path (the KVKK notice, the notice for people in the
// garden), same origin as the portal.
export function siteLink(baseUrl: string, path: "/kvkk" | "/bahcede-bulunanlar"): string | null {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return null;
  }
  if (base.protocol !== "https:" && base.protocol !== "http:") return null;
  return base.origin + path;
}

export type RenderResult = { ok: true; body: string } | { ok: false; error: string };

export function renderNotification(
  template: string,
  vars: TemplateVars,
  portalBaseUrl: string,
): RenderResult {
  if (template === "viewer_invited") {
    const parcel = typeof vars.parcel_name === "string" ? vars.parcel_name.trim() : "";
    const link = typeof vars.path === "string" ? portalLink(portalBaseUrl, vars.path) : null;
    const notice = siteLink(portalBaseUrl, "/kvkk");
    if (!parcel) return { ok: false, error: "invalid_vars" };
    if (!link || !notice) return { ok: false, error: "invalid_link" };
    return {
      ok: true,
      body: `orchadOS: ${parcel} bahçesinin sahibi sizi raporları görmeniz için davet etti; numaranızı bize o verdi. Kişisel verileriniz: ${notice} Giriş: ${link}`,
    };
  }
  if (template === "visit_scheduled") {
    const parcel = typeof vars.parcel_name === "string" ? vars.parcel_name.trim() : "";
    const day = typeof vars.date === "string" ? formatDayTr(vars.date) : null;
    const link = typeof vars.path === "string" ? portalLink(portalBaseUrl, vars.path) : null;
    const notice = siteLink(portalBaseUrl, "/bahcede-bulunanlar");
    if (!day) return { ok: false, error: "invalid_vars" };
    if (!link || !notice) return { ok: false, error: "invalid_link" };
    const gardenOf = parcel ? `${parcel} adlı bahçenizin` : "bahçenizin";
    return {
      ok: true,
      body: `orchadOS: ${gardenOf} denetim ziyareti ${day} günü yapılacak. Bahçede çalışan ya da bulunacak kişilere görüntü alınacağını iletmenizi rica ederiz; bilgi: ${notice} Erteleme ve ayrıntı: ${link}`,
    };
  }
  if (isAccountTemplate(template)) {
    const ref = typeof vars.ref === "string" ? vars.ref.trim() : "";
    const refOk = new RegExp(`^${ACCOUNT_REF_PREFIX[template]}-\\d{4}-\\d{6}$`).test(ref);
    const link = typeof vars.path === "string" ? portalLink(portalBaseUrl, vars.path) : null;
    // Optional for garden messages; nothing else uses it.
    const parcel = typeof vars.parcel_name === "string" ? vars.parcel_name.trim() : "";
    if (!refOk) return { ok: false, error: "invalid_vars" };
    if (!link) return { ok: false, error: "invalid_link" };
    return { ok: true, body: renderAccount(template, ref, link, parcel) };
  }

  const parcel = typeof vars.parcel_name === "string" ? vars.parcel_name.trim() : "";
  const day = typeof vars.date === "string" ? formatDayTr(vars.date) : null;
  const link = typeof vars.path === "string" ? portalLink(portalBaseUrl, vars.path) : null;
  if (!parcel || !day) return { ok: false, error: "invalid_vars" };
  if (!link) return { ok: false, error: "invalid_link" };

  switch (template) {
    case "report_ready":
      return { ok: true, body: `${parcel} için ${day} denetim raporunuz hazır: ${link}` };
    case "critical_finding":
      return {
        ok: true,
        body: `${parcel} için ${day} denetiminde uzmanımız acil bir bulgu onayladı. Ayrıntı: ${link}`,
      };
    default:
      return { ok: false, error: "unknown_template" };
  }
}

export function renderLoginCode(code: string): string {
  return `orchadOS giriş kodunuz: ${code}. Kodu kimseyle paylaşmayın.`;
}

// Retry policy: attempt n (1-based) failed with a temporary error -> wait
// 1, 4, 16, 60 minutes; after MAX_ATTEMPTS the message is failed. Permanent
// errors (no phone, bad template, number rejected) fail at once.
export const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 60_000;
const MAX_DELAY_MS = 60 * 60_000;

export function retryDelayMs(attempt: number): number {
  const n = Math.max(1, Math.floor(attempt));
  return Math.min(BASE_DELAY_MS * 4 ** (n - 1), MAX_DELAY_MS);
}

export type RetryDecision = { outcome: "retry"; retryAt: Date } | { outcome: "failed" };

export function decideRetry(attempt: number, permanent: boolean, now: Date): RetryDecision {
  if (permanent || attempt >= MAX_ATTEMPTS) return { outcome: "failed" };
  return { outcome: "retry", retryAt: new Date(now.getTime() + retryDelayMs(attempt)) };
}
