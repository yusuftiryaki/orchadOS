"use client";

import { useActionState } from "react";
import { publishAction, type PublishState } from "@/app/uzman/actions";
import { t } from "@/lib/i18n";
import styles from "./expert.module.css";

const initial: PublishState = { error: null, missing: [] };

export function PublishForm({ sessionId }: { sessionId: string }) {
  const [state, action, pending] = useActionState(publishAction, initial);
  const errors = t.expert.summary.errors;
  const message =
    state.error === "incomplete"
      ? errors.incomplete(state.missing.join(", "))
      : state.error
        ? (errors[state.error as Exclude<keyof typeof errors, "incomplete">] ?? errors.write_failed)
        : null;

  return (
    <form action={action} className={styles.form} data-testid="publish-form">
      <input type="hidden" name="sessionId" value={sessionId} />
      <label className={styles.inline}>
        <input type="checkbox" name="confirm" />
        {t.expert.summary.confirm}
      </label>
      {message && (
        <p role="alert" className={`${styles.notice} ${styles.error}`}>
          {message}
        </p>
      )}
      <div>
        <button className="button" type="submit" disabled={pending}>
          {pending ? t.expert.summary.publishing : t.expert.summary.publish}
        </button>
      </div>
    </form>
  );
}
