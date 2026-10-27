import { FormError, Notice } from "@/components/operations/field";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { readPortalResult } from "@/lib/portal-billing/urls";

type Params = Record<string, string | string[] | undefined>;

// The notice or error a redirect after a save put into the URL.
export function PortalResult({ params }: { params: Params }) {
  const result = readPortalResult(params);
  return (
    <>
      {result.notice && <Notice>{P.notices[result.notice]}</Notice>}
      <FormError
        error={
          result.error === "application_incomplete" && result.missing
            ? P.application.incomplete(P.application.incompleteFields[result.missing])
            : result.error
              ? P.errors[result.error]
              : null
        }
      />
    </>
  );
}
