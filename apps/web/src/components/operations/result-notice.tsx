import { t } from "@/lib/i18n";
import { readResult } from "@/lib/operations/urls";
import { FormError, Notice } from "./field";

type Params = Record<string, string | string[] | undefined>;

// The notice or error a redirect after a save put into the URL.
export function ResultNotice({ params }: { params: Params }) {
  const result = readResult(params);
  return (
    <>
      {result.notice && <Notice>{t.operations.notices[result.notice]}</Notice>}
      {result.boundary && <Notice>{t.operations.parcel.boundarySaved(result.boundary)}</Notice>}
      <FormError error={result.error ? t.operations.errors[result.error] : null} />
    </>
  );
}
