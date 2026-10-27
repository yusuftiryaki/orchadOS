import { LegalPage, legalMetadata } from "@/components/site/legal-page";

export const metadata = legalMetadata("refund_policy");

export default function RefundPolicyPage() {
  return <LegalPage which="refund_policy" />;
}
