"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "./button";
import styles from "./dialog.module.css";

// A modal on the native <dialog>: focus moves in and back, Escape closes,
// the page behind is inert. `open` is controlled by the caller.
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  closeLabel = "Kapat",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby={titleId} onClose={onClose}>
      <div className={styles.head}>
        <h2 id={titleId}>{title}</h2>
        <Button variant="quiet" size="sm" className={styles.close} onClick={onClose}>
          {closeLabel}
        </Button>
      </div>
      <div className={styles.body}>{children}</div>
      {footer && <div className={styles.foot}>{footer}</div>}
    </dialog>
  );
}
