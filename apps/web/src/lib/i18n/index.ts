import { tr, type Messages } from "./tr";

// Single active locale for now. Switching to per-request locales means
// replacing this constant with a lookup; call sites keep using `t`.
export const locale = "tr-TR";
export const t: Messages = tr;

// Display text of a metric category value; unknown codes are shown as they are.
export function categoryLabel(code: string): string {
  return t.metricCategories[code] ?? code;
}

export function formatNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(iso),
  );
}

// Date and time in Turkey (UTC+3, no daylight saving since 2016), e.g. a photo's
// capture time on the tree card.
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Istanbul",
  }).format(new Date(iso));
}
