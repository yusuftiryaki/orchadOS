import type { Metadata } from "next";
import { legalText } from "@/lib/i18n/messages/legal";
import { getCompanyInfo } from "@/lib/legal/company-info";
import { fillCompanyDocument } from "@/lib/legal/company-placeholders";
import { LEGAL_TEXT_VERSIONS, type LegalText } from "@/lib/legal/versions";
import { LegalDocumentView } from "./legal-document";

export function legalMetadata(which: LegalText): Metadata {
  const doc = legalText[which];
  return { title: doc.title, description: doc.description };
}

// The text as in legal.ts, its company placeholders filled once the company
// information is complete (T21).
export async function LegalPage({ which }: { which: LegalText }) {
  const document = fillCompanyDocument(legalText[which], await getCompanyInfo());
  return <LegalDocumentView document={document} version={LEGAL_TEXT_VERSIONS[which]} />;
}
