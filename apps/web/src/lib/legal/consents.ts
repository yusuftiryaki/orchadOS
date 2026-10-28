// Which optional explicit consents the site and the portal ask for
// (docs/hukuk/kararlar.md H06, H31). Old records of a kind that is not asked
// stay in consent_record and can still be withdrawn; nothing relies on them.
//
// Marketing (SMS) is asked only after the company's İYS registration and
// integration (T22): an approval not uploaded to İYS in time is void. Service
// improvement is never asked: in-house improvement rests on legitimate
// interest (KVKK md. 5/2-f).
export const MARKETING_CONSENT_ENABLED = false;

export const EXPLICIT_CONSENT_KINDS = [
  "explicit_service_improvement",
  "explicit_marketing",
] as const;
export type ExplicitConsentKind = (typeof EXPLICIT_CONSENT_KINDS)[number];

export function isExplicitConsentAsked(kind: ExplicitConsentKind): boolean {
  return kind === "explicit_marketing" && MARKETING_CONSENT_ENABLED;
}
