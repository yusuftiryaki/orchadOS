"use client";

import { useActionState } from "react";
import { publishAction, type PublishState } from "@/app/uzman/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/field";
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
      <Checkbox id="publish-confirm" name="confirm" label={t.expert.summary.confirm} />
      {message && (
        <Alert tone="danger" role="alert">
          {message}
        </Alert>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? t.expert.summary.publishing : t.expert.summary.publish}
        </Button>
      </div>
    </form>
  );
}
