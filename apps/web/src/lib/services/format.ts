// Display helpers of the service layer (IP15). Pure; unit tested.

const MONTHS = [
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

// Locative suffix of each month name ("1 Mart'ta", "1 Nisan'da").
const LOCATIVE = ["ta", "ta", "ta", "da", "ta", "da", "da", "ta", "de", "de", "da", "ta"];

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// A date (YYYY-MM-DD) or a timestamp as the Istanbul calendar day, YYYY-MM-DD.
export function istanbulDay(value: string): string {
  if (DAY_RE.test(value)) return value;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date(value));
}

function parts(value: string): { year: number; month: number; day: number } {
  const [, y, m, d] = DAY_RE.exec(istanbulDay(value))!;
  return { year: Number(y), month: Number(m), day: Number(d) };
}

// "14 Nisan 2027".
export function longDate(value: string): string {
  const { year, month, day } = parts(value);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

// "14 Nisan", with the year only when it is not the year of `today`.
export function shortDate(value: string, today: string): string {
  const { year, month, day } = parts(value);
  return year === parts(today).year ? `${day} ${MONTHS[month - 1]}` : longDate(value);
}

// "1 Mart'ta" (the year is left out: the next season start is within a year).
export function dayMonthLocative(value: string): string {
  const { month, day } = parts(value);
  return `${day} ${MONTHS[month - 1]}'${LOCATIVE[month - 1]}`;
}

function group(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// Kuruş as the portal writes prices in running text: 882000 → "8.820 TL",
// 882050 → "8.820,50 TL" (kuruş only when there are any).
export function formatTl(kurus: number | bigint): string {
  const value = typeof kurus === "bigint" ? kurus : BigInt(Math.trunc(kurus));
  const negative = value < BigInt(0);
  const abs = negative ? -value : value;
  const lira = group((abs / BigInt(100)).toString());
  const cents = abs % BigInt(100);
  const text = cents === BigInt(0) ? lira : `${lira},${cents.toString().padStart(2, "0")}`;
  return `${negative ? "-" : ""}${text} TL`;
}

// VAT rate in basis points as the forms write it: 2000 → "20", 1050 → "10,5".
export function vatPercent(bp: number): string {
  return String(bp / 100).replace(".", ",");
}
