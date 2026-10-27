import type { Metadata } from "next";
import { legalText } from "@/lib/i18n/messages/legal";
import { LEGAL_TEXT_VERSIONS, type LegalText } from "@/lib/legal/versions";
import { LegalDocumentView } from "./legal-document";

export function legalMetadata(which: LegalText): Metadata {
  const doc = legalText[which];
  return { title: doc.title, description: doc.description };
}

export function LegalPage({ which }: { which: LegalText }) {
  return <LegalDocumentView document={legalText[which]} version={LEGAL_TEXT_VERSIONS[which]} />;
}
