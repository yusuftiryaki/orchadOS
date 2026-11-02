import { LegalPage, legalMetadata } from "@/components/site/legal-page";

export const metadata = legalMetadata("service_terms");

export default function ServiceTermsPage() {
  return <LegalPage which="service_terms" />;
}
