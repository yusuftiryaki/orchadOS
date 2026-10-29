import { LegalPage, legalMetadata } from "@/components/site/legal-page";

export const metadata = legalMetadata("field_notice");

export default function FieldNoticePage() {
  return <LegalPage which="field_notice" />;
}
