// Message texts and the retry policy, shared by send-notifications and
// send-sms. Pure TypeScript without imports or Deno APIs: the web app's unit
// tests (apps/web/src/lib/notifications/messaging.test.ts) import this file.
//
// Template variables are limited to the parcel name, the visit day, the
// portal path and a document number (KVKK: no names, no finding text, no
// amounts or reasons; the database checks the keys).

export type Channel = "sms" | "whatsapp";
export type ReportTemplate = "report_ready" | "critical_finding";
// Customer account messages (docs/musteri-yonetimi.md §12): ref is the
// document number (T-…, B-…, M-…, I-…, S-…).
export type AccountTemplate =
  | "quote_ready"
  | "application_rejected"
  | "payment_received"
  | "refund_completed"
  | "payment_reminder";
export type Template = ReportTemplate | AccountTemplate;

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
};

const isAccountTemplate = (template: string): template is AccountTemplate =>
  Object.prototype.hasOwnProperty.call(ACCOUNT_REF_PREFIX, template);

function renderAccount(template: AccountTemplate, ref: string, link: string): string {
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

// Base URL of the portal + a portal path. Only /portal/... paths are linked.
export function portalLink(baseUrl: string, path: string): string | null {
  if (!/^\/portal\/[A-Za-z0-9/_-]*$/.test(path)) return null;
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return null;
  }
  if (base.protocol !== "https:" && base.protocol !== "http:") return null;
  return base.origin + base.pathname.replace(/\/+$/, "") + path;
}

export type RenderResult = { ok: true; body: string } | { ok: false; error: string };

export function renderNotification(
  template: string,
  vars: TemplateVars,
  portalBaseUrl: string,
): RenderResult {
  if (isAccountTemplate(template)) {
    const ref = typeof vars.ref === "string" ? vars.ref.trim() : "";
    const refOk = new RegExp(`^${ACCOUNT_REF_PREFIX[template]}-\\d{4}-\\d{6}$`).test(ref);
    const link = typeof vars.path === "string" ? portalLink(portalBaseUrl, vars.path) : null;
    if (!refOk) return { ok: false, error: "invalid_vars" };
    if (!link) return { ok: false, error: "invalid_link" };
    return { ok: true, body: renderAccount(template, ref, link) };
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
