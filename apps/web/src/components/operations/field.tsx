import { cloneElement, isValidElement } from "react";
import { t } from "@/lib/i18n";
import styles from "./operations.module.css";

// Label, control, hint and error of one form field. The control (input,
// select or textarea) is the only child; it gets an id from its name, so the
// label names it alone and the hint and error describe it.
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
  const id = name ? `f-${name}` : undefined;
  const described = id
    ? [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ") || undefined
    : undefined;
  const control = id
    ? cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        id,
        "aria-describedby": described,
        "aria-invalid": error ? true : undefined,
      })
    : children;

  return (
    <div className={wide ? `${styles.field} ${styles.wide}` : styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {optional && <span className="muted"> ({t.operations.optional})</span>}
      </label>
      {control}
      {hint && (
        <span className={styles.hint} id={id && `${id}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className={styles.fieldError} id={id && `${id}-error`} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className={`${styles.notice} ${styles.error}`} role="alert">
      {error}
    </p>
  );
}

export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className={styles.notice} role="status">
      {children}
    </p>
  );
}
