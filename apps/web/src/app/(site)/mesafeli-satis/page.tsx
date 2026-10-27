import { LegalPage, legalMetadata } from "@/components/site/legal-page";

export const metadata = legalMetadata("distance_sales");

export default function DistanceSalesPage() {
  return <LegalPage which="distance_sales" />;
}
