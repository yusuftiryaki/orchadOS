import { LegalPage, legalMetadata } from "@/components/site/legal-page";

export const metadata = legalMetadata("pre_information");

export default function PreInformationPage() {
  return <LegalPage which="pre_information" />;
}
