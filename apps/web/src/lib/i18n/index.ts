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

// Display unit of a metric's unit code (m3 → m³, count → adet).
export function formatUnit(unit: string | null | undefined): string {
  if (!unit) return "";
  return t.units[unit] ?? unit;
}

// A measured value with its uncertainty (1σ; left out when null or zero) and
// unit: "4,4 ± 0,1 m". The uncertainty is never shown smaller than the last
// digit of the value (0,04 → 0,1).
export function formatMeasure(
  value: number,
  unit: string | null | undefined,
  uncertainty: number | null = null,
  digits = 1,
): string {
  let text = formatNumber(value, digits);
  if (uncertainty !== null && Number.isFinite(uncertainty) && uncertainty > 0) {
    text += ` ± ${formatNumber(Math.max(uncertainty, 10 ** -digits), digits)}`;
  }
  const u = formatUnit(unit);
  return u ? `${text} ${u}` : text;
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
