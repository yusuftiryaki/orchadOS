import { FormError, Notice } from "@/components/operations/field";
import { Facts as FactList } from "@/components/ui/facts";
import { Alert } from "@/components/ui/alert";
import { Badge as UiBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { readBoResult } from "@/lib/back-office/urls";
import type { OpsOrg } from "@/lib/operations/data";
import { formatKurus } from "@/lib/billing/money";
import { formatDate, formatDateTime } from "@/lib/i18n";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { billingText } from "@/lib/i18n/messages/billing";
import { statusTone, type StatusKind } from "@/components/ui/status";
import bo from "./back-office.module.css";

// Small pieces shared by the back office pages.

const B = backOfficeText;

type Params = Record<string, string | string[] | undefined>;

// The notice or error a redirect after a save put into the URL.
export function BoResultNotice({ params }: { params: Params }) {
  const result = readBoResult(params);
  const error = result.error
    ? result.error === "payments_unreachable"
      ? B.paymentsUnreachable
      : billingText.errors[result.error]
    : null;
  return (
    <>
      {result.notice && <Notice>{B.notices[result.notice]}</Notice>}
      <FormError error={error} />
    </>
  );
}

export const money = (kurus: number | null | undefined, currency = "TRY") =>
  kurus == null ? B.none : formatKurus(kurus, currency);

export const day = (iso: string | null | undefined) => (iso ? formatDate(iso) : B.none);
export const when = (iso: string | null | undefined) => (iso ? formatDateTime(iso) : B.none);

// A status code with its Turkish label (unknown codes as they are), in the
// tone the same status has on every screen (components/ui/status.ts).
export function Badge({
  labels,
  value,
  kind,
}: {
  labels: Record<string, string>;
  value: string;
  kind?: StatusKind;
}) {
  return <UiBadge tone={statusTone(value, kind)}>{labels[value] ?? value}</UiBadge>;
}

export function Warning({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <Alert tone="warning" testId={testId}>
      <p>{children}</p>
    </Alert>
  );
}

// The org picker of the screens that work in one org (prices, settings, the
// audit log), for a user who is ops in more than one. Org ids are not
// personal data, so the choice goes in the URL (?org=).
export function OrgPicker({
  orgs,
  current,
  action,
}: {
  orgs: OpsOrg[];
  current: string;
  action: string;
}) {
  if (orgs.length < 2) return null;
  return (
    <form className={bo.picker} action={action} data-testid="org-picker">
      <Field id="org-picker" label={B.org}>
        <Select name="org" defaultValue={current}>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
      </Field>
      <Button variant="secondary" type="submit">
        {B.apply}
      </Button>
    </form>
  );
}

// Label → value pairs.
export function Facts({ rows, testId }: { rows: [string, React.ReactNode][]; testId?: string }) {
  return <FactList rows={rows} testId={testId} none={B.none} />;
}

// Submit button of an ActionForm.
export function Submit({
  children,
  name,
  value,
  secondary,
}: {
  children: React.ReactNode;
  name?: string;
  value?: string;
  secondary?: boolean;
}) {
  return (
    <Button variant={secondary ? "secondary" : "primary"} type="submit" name={name} value={value}>
      {children}
    </Button>
  );
}
