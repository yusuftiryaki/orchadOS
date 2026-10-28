import { t } from "@/lib/i18n";
import { readLegalResult } from "@/lib/operations/legal";
import { FormError, Notice } from "./field";

type Params = Record<string, string | string[] | undefined>;

// The notice or error a legal follow-up action put into the URL; unknown
// codes show nothing.
export function LegalNotice({ params }: { params: Params }) {
  const { notice, error } = readLegalResult(params);
  const text = notice ? t.legal.notices[notice] : undefined;
  return (
    <>
      {text && <Notice>{text}</Notice>}
      <FormError error={error ? (t.legal.errors[error] ?? null) : null} />
    </>
  );
}
