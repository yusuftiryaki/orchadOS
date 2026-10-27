import { locale } from "@/lib/i18n";

// Money is kept in kuruş (bigint in the database, integer here). Shown as
// "1.250,50 ₺"; whole amounts without decimals ("1.250 ₺").
export function formatTry(kurus: number): string {
  const whole = kurus % 100 === 0;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(kurus / 100);
}

// VAT rate in basis points (2000 = %20) as "20" or "1,5".
export function formatVatRate(bp: number): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(bp / 100);
}
