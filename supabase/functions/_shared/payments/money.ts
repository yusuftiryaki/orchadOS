// Money as integer kuruş. Provider prices are decimal strings; they are parsed
// exactly, never through floating point (docs/musteri-yonetimi.md §8.2).

const PRICE_RE = /^(\d+)(?:\.(\d{1,4}))?$/;

// "10.5100" -> 1051, "12000" -> 1200000. Anything that is not a plain decimal
// with at most two significant fraction digits is null: "0.285", "1e3", "-1".
// JSON numbers are accepted as their shortest string form (120.5 -> "120.5").
export function priceToKurus(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const s = typeof value === "number" ? (Number.isFinite(value) ? String(value) : "") : value;
  const m = PRICE_RE.exec(s);
  if (!m) return null;
  const fraction = m[2] ?? "";
  if (/[^0]/.test(fraction.slice(2))) return null;
  const kurus = Number(m[1]) * 100 + Number(fraction.slice(0, 2).padEnd(2, "0"));
  return Number.isSafeInteger(kurus) ? kurus : null;
}

// 1200000 -> "12000.00"
export function kurusToPrice(kurus: number): string {
  if (!Number.isSafeInteger(kurus) || kurus < 0) throw new RangeError("invalid_amount");
  const lira = Math.floor(kurus / 100);
  const rest = kurus % 100;
  return `${lira}.${String(rest).padStart(2, "0")}`;
}

// iyzico signs prices without trailing zeros: "10.50" -> "10.5", "10.0" -> "10".
export function normalizePriceForSignature(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const s = String(value);
  if (!s.includes(".")) return s;
  return s.replace(/0+$/, "").replace(/\.$/, "");
}
