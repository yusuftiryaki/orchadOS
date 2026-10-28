"use client";

import { useActionState, useTransition } from "react";
import type { BoFormState } from "@/lib/back-office/form-state";
import { EMPTY_BO_FORM } from "@/lib/back-office/form-state";
import { FormError } from "@/components/operations/field";
import styles from "@/components/operations/operations.module.css";
import bo from "./back-office.module.css";

// A back office form posting to a server action. On success the action
// redirects (with a notice); on failure it returns the error text, and the
// form keeps what was typed: the submit is not a native form action, so React
// does not reset the fields. The children are rendered on the server.
export function ActionForm({
  action,
  children,
  testId,
  inline,
}: {
  action: (prev: BoFormState, form: FormData) => Promise<BoFormState>;
  children: React.ReactNode;
  testId?: string;
  inline?: boolean;
}) {
  const [state, formAction] = useActionState(action, EMPTY_BO_FORM);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className={inline ? styles.inline : styles.form}
      data-testid={testId}
      aria-busy={pending || undefined}
      onSubmit={(event) => {
        event.preventDefault();
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        const data = new FormData(event.currentTarget, submitter);
        startTransition(() => formAction(data));
      }}
    >
      <fieldset className={bo.bare} disabled={pending}>
        {children}
      </fieldset>
      <FormError error={state.error} />
      {state.lines && (
        <ul className={styles.plainList} data-testid={testId && `${testId}-results`}>
          {state.lines.map((line, i) => (
            <li key={i} data-ok={line.ok}>
              {line.label}: {line.text}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
