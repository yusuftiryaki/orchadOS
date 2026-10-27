// ASCII file name for a report download: "envanter-ornek-bahce-1-2026-10-10.pdf".
const TR: Record<string, string> = { ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u" };

export function pdfFileName(kind: string, parcelName: string, date: string | null): string {
  const slug = parcelName
    .replace(/[çğıİöşüÇĞÖŞÜ]/g, (ch) => TR[ch.toLowerCase()] ?? TR[ch] ?? ch)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const day = date ? date.slice(0, 10) : null;
  return [kind, slug || "bahce", day].filter(Boolean).join("-") + ".pdf";
}
