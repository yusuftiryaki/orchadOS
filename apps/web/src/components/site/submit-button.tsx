import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import styles from "./auth.module.css";

// The one primary action of an auth card: full width, a spinner and the
// pending label ("Giriş yapılıyor…") while the request runs.
export function SubmitButton({
  pending,
  children,
  pendingLabel,
  testId,
}: {
  pending: boolean;
  children: ReactNode;
  pendingLabel: ReactNode;
  testId?: string;
}) {
  return (
    <Button
      type="submit"
      block
      className={styles.submit}
      disabled={pending}
      aria-busy={pending || undefined}
      data-testid={testId}
    >
      {pending && <span className={styles.spinner} aria-hidden />}
      {pending ? pendingLabel : children}
    </Button>
  );
}
