import { LegalDocumentView } from "@/components/site/legal-document";
import { legalMetadata } from "@/components/site/legal-page";
import { demoText } from "@/lib/i18n/messages/demo";
import { legalText } from "@/lib/i18n/messages/legal";
import { LEGAL_TEXT_VERSIONS } from "@/lib/legal/versions";

export const metadata = legalMetadata("privacy");

// The policy with the demo tour paragraph (docs/demo-turu.md §12) before
// "Haklarınız". It is part of the draft (gizlilik-v1-taslak) and awaits the
// lawyer with the rest of the text.
export default function PrivacyPage() {
  const doc = legalText.privacy;
  const rights = doc.blocks.findIndex((b) => b.kind === "h2" && b.text.startsWith("5."));
  const at = rights < 0 ? doc.blocks.length : rights;
  const blocks = [...doc.blocks.slice(0, at), ...demoText.privacy, ...doc.blocks.slice(at)];
  return <LegalDocumentView document={{ ...doc, blocks }} version={LEGAL_TEXT_VERSIONS.privacy} />;
}
