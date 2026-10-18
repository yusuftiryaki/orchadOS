import { tr, type Messages } from "./tr";

// Single active locale for now. Switching to per-request locales means
// replacing this constant with a lookup; call sites keep using `t`.
export const locale = "tr-TR";
export const t: Messages = tr;

export function formatNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(iso),
  );
}
