// Versions of the legal texts shown on the site and recorded with consents
// (docs/musteri-yonetimi.md §9). A version ending in "-taslak" is a draft:
// its page shows a banner. A new text gets a new version; old consents keep
// the version they were given for.
export const LEGAL_TEXT_VERSIONS = {
  kvkk_notice: "kvkk-v1-taslak",
  explicit_consent: "riza-v1-taslak",
  privacy: "gizlilik-v1-taslak",
  distance_sales: "mesafeli-v2-taslak",
  pre_information: "onbilgi-v2-taslak",
  refund_policy: "iade-v2-taslak",
} as const;

export type LegalText = keyof typeof LEGAL_TEXT_VERSIONS;

export function isDraftVersion(version: string): boolean {
  return version.endsWith("-taslak");
}
