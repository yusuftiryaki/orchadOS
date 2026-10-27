import { LegalPage, legalMetadata } from "@/components/site/legal-page";

export const metadata = legalMetadata("kvkk_notice");

export default function KvkkPage() {
  return <LegalPage which="kvkk_notice" />;
}
