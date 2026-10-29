import {
  Children,
  cloneElement,
  isValidElement,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";
import styles from "./field.module.css";

type ControlProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
};

// Label, hint and error around one control. The control gets the id and the
// aria-describedby / aria-invalid that tie it to the hint and the error, so
// a screen reader reads "Cep telefonu, 05xx xxx xx xx, Bu alan gerekli."
export function Field({
  id,
  label,
  hint,
  error,
  optional,
  errorTestId,
  className,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  // Shown after the label ("isteğe bağlı"); required is the default.
  optional?: string;
  errorTestId?: string;
  className?: string;
  children: ReactElement<ControlProps>;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const control = Children.only(children);
  return (
    <div className={className ? `${styles.field} ${className}` : styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {optional && <span className={styles.optional}> ({optional})</span>}
      </label>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      <div className={styles.control}>
        {isValidElement(control)
          ? cloneElement(control, {
              id,
              "aria-describedby": describedBy,
              "aria-invalid": error ? true : undefined,
            })
          : control}
      </div>
      {error && (
        <p id={errorId} className={styles.error} data-testid={errorTestId}>
          {error}
        </p>
      )}
    </div>
  );
}

// Plain controls; globals.css styles them, these exist so screens import one
// place and can pass `invalid`.
export function Input({ invalid, ...props }: ComponentProps<"input"> & { invalid?: boolean }) {
  return <input aria-invalid={invalid || undefined} {...props} />;
}

export function Select({ invalid, ...props }: ComponentProps<"select"> & { invalid?: boolean }) {
  return <select aria-invalid={invalid || undefined} {...props} />;
}

export function Textarea({
  invalid,
  ...props
}: ComponentProps<"textarea"> & { invalid?: boolean }) {
  return <textarea aria-invalid={invalid || undefined} {...props} />;
}

// A checkbox with its label beside it; the hint and error sit under the label.
export function Checkbox({
  id,
  label,
  hint,
  error,
  errorTestId,
  ...props
}: Omit<ComponentProps<"input">, "type"> & {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  errorTestId?: string;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={styles.check}>
      <input
        type="checkbox"
        id={id}
        aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      <label htmlFor={id} className={styles.checkLabel}>
        {label}
      </label>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error} data-testid={errorTestId}>
          {error}
        </p>
      )}
    </div>
  );
}
