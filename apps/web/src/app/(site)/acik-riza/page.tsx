import { LegalPage, legalMetadata } from "@/components/site/legal-page";

export const metadata = legalMetadata("explicit_consent");

export default function ExplicitConsentPage() {
  return <LegalPage which="explicit_consent" />;
}
