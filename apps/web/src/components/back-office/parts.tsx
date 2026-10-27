import { FormError, Notice } from "@/components/operations/field";
import styles from "@/components/operations/operations.module.css";
import { readBoResult } from "@/lib/back-office/urls";
import { formatKurus } from "@/lib/billing/money";
import { formatDate, formatDateTime } from "@/lib/i18n";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { billingText } from "@/lib/i18n/messages/billing";
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

// A status code with its Turkish label (unknown codes as they are).
export function Badge({ labels, value }: { labels: Record<string, string>; value: string }) {
  return (
    <span className={styles.badge} data-status={value}>
      {labels[value] ?? value}
    </span>
  );
}

export function Warning({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <p className={bo.warning} data-testid={testId}>
      {children}
    </p>
  );
}

// Label → value pairs.
export function Facts({ rows, testId }: { rows: [string, React.ReactNode][]; testId?: string }) {
  return (
    <dl className={styles.dl} data-testid={testId}>
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: "contents" }}>
          <dt>{label}</dt>
          <dd>{value ?? B.none}</dd>
        </div>
      ))}
    </dl>
  );
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
    <button
      className={secondary ? "button button-secondary" : "button"}
      type="submit"
      name={name}
      value={value}
    >
      {children}
    </button>
  );
}
