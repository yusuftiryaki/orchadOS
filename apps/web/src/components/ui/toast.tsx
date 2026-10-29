"use client";

import { useEffect, type ReactNode } from "react";
import { Alert, type AlertTone } from "./alert";
import styles from "./alert.module.css";
import { Button } from "./button";

// A short confirmation after an action ("Kaydedildi"). Closes itself after
// `duration` ms; errors that need reading belong in an Alert on the page.
export function Toast({
  open,
  onClose,
  tone = "success",
  children,
  duration = 6000,
  closeLabel = "Kapat",
}: {
  open: boolean;
  onClose: () => void;
  tone?: AlertTone;
  children: ReactNode;
  duration?: number;
  closeLabel?: string;
}) {
  useEffect(() => {
    if (!open || duration <= 0) return;
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [open, duration, onClose]);

  return (
    <div role="status" aria-live="polite">
      {open && (
        <div className={styles.toast}>
          <Alert tone={tone}>{children}</Alert>
          <Button variant="secondary" size="sm" onClick={onClose}>
            {closeLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
