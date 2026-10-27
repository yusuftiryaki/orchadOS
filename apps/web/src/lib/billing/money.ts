// Money and area display for billing (docs/musteri-yonetimi.md §6.1): amounts
// are integer kuruş (bigint in the database), areas m². Parsing is exact
// decimal arithmetic on the digits; no floating point is involved.

const WHITESPACE = /\s+/g;

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// 1200000 → "12.000,00 ₺"; other currencies end with their code.
export function formatKurus(kurus: number | bigint, currency = "TRY"): string {
  const value = typeof kurus === "bigint" ? kurus : BigInt(Math.trunc(kurus));
  const negative = value < BigInt(0);
  const abs = negative ? -value : value;
  const hundred = BigInt(100);
  const lira = groupThousands((abs / hundred).toString());
  const cents = (abs % hundred).toString().padStart(2, "0");
  const suffix = currency === "TRY" ? "₺" : currency;
  return `${negative ? "-" : ""}${lira},${cents} ${suffix}`;
}

const TL_RE = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/;

// Turkish lira as typed in a form → kuruş, or null. Accepts "12.000,50",
// "12000,5", "12000" (an optional trailing "₺" or "TL"); not negative values,
// more than two decimals or English separators ("12000.50").
export function parseTlToKurus(input: string): number | null {
  const text = input.replace(WHITESPACE, "").replace(/(₺|TL)$/i, "");
  const match = TL_RE.exec(text);
  if (!match) return null;
  const lira = match[1].replace(/\./g, "");
  const cents = (match[2] ?? "").padEnd(2, "0");
  const kurus = Number(lira) * 100 + Number(cents);
  return Number.isSafeInteger(kurus) ? kurus : null;
}

// 1 dönüm = 1000 m².
export function donumFromM2(m2: number): number {
  return m2 / 1000;
}

// 20100 → "20,1 dönüm" (one decimal at most).
export function formatDonum(m2: number): string {
  const value = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(
    donumFromM2(m2),
  );
  return `${value} dönüm`;
}
