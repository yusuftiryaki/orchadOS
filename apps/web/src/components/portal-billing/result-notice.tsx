import { Alert } from "@/components/ui/alert";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { readPortalResult } from "@/lib/portal-billing/urls";

type Params = Record<string, string | string[] | undefined>;

// The notice or error a redirect after a save put into the URL: a
// confirmation is a status, an error an alert that says how to fix it.
export function PortalResult({ params }: { params: Params }) {
  const result = readPortalResult(params);
  const error =
    result.error === "application_incomplete" && result.missing
      ? P.application.incomplete(P.application.incompleteFields[result.missing])
      : result.error
        ? P.errors[result.error]
        : null;
  return (
    <>
      {result.notice && (
        <Alert tone="success" role="status">
          <p>{P.notices[result.notice]}</p>
        </Alert>
      )}
      {error && (
        <Alert tone="danger" role="alert">
          <p>{error}</p>
        </Alert>
      )}
    </>
  );
}
