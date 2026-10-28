// Versions of the legal texts shown on the site and recorded with consents
// (docs/musteri-yonetimi.md §9). A version ending in "-taslak" is a draft:
// its page shows a banner. A new text gets a new version; old consents keep
// the version they were given for.
//
// The database knows the current versions and their template hashes
// (private.legal_text_version, T21; hashes from text-hash.ts). Every text
// change or version bump here or in legal.ts, also removing "-taslak" at
// launch, ships a registry migration (private.register_legal_text) in the same
// PR; text-hash.test.ts and the integration test legal-registry.test.ts fail
// until it does. Between deploy-db and the Vercel deploy the database refuses
// an acceptance with legal_text_outdated (safe) and the page asks the customer
// to reload.
export const LEGAL_TEXT_VERSIONS = {
  kvkk_notice: "kvkk-v2-taslak",
  explicit_consent: "riza-v2-taslak",
  privacy: "gizlilik-v2-taslak",
  distance_sales: "mesafeli-v3-taslak",
  pre_information: "onbilgi-v3-taslak",
  refund_policy: "iade-v3-taslak",
  field_notice: "bahcede-v1-taslak",
} as const;

export type LegalText = keyof typeof LEGAL_TEXT_VERSIONS;

export function isDraftVersion(version: string): boolean {
  return version.endsWith("-taslak");
}
