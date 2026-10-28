import { isValidElement } from "react";
import { Alert } from "@/components/ui/alert";
import { Field as UiField } from "@/components/ui/field";
import { t } from "@/lib/i18n";
import styles from "./operations.module.css";

// Label, control, hint and error of one form field. The control (input,
// select or textarea) is the only child; it gets an id from its name, so the
// label names it alone and the hint and error describe it (components/ui/field).
export function Field({
  label,
  hint,
  error,
  optional,
  wide,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  wide?: boolean;
  children: React.ReactElement<{ name?: string; id?: string }>;
}) {
  const name = isValidElement(children) ? children.props.name : undefined;
  return (
    <UiField
      id={children.props.id ?? `f-${name ?? "field"}`}
      label={label}
      hint={hint}
      // role=alert: a server-side validation error is announced on load.
      error={error ? <span role="alert">{error}</span> : undefined}
      optional={optional ? t.operations.optional : undefined}
      className={wide ? styles.wide : undefined}
    >
      {children}
    </UiField>
  );
}

// The error of the last action (a redirect put it into the URL, or the form
// returned it).
export function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className={styles.message}>
      <Alert tone="danger" role="alert">
        <p>{error}</p>
      </Alert>
    </div>
  );
}

// The confirmation of the last action.
export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.message}>
      <Alert tone="success" role="status">
        <p>{children}</p>
      </Alert>
    </div>
  );
}
