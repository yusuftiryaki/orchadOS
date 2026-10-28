"use client";

import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";
import styles from "./site.module.css";

// The phone menu of the site header: one button that opens the links below
// the bar. A link click or Escape closes it; focus returns to the button.
export function MobileNav({
  openLabel,
  closeLabel,
  children,
}: {
  openLabel: string;
  closeLabel: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function onPanelClick(event: MouseEvent) {
    if ((event.target as HTMLElement).closest("a")) setOpen(false);
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        className={styles.menuButton}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        data-testid="site-menu"
      >
        <span className={styles.menuIcon} data-open={open || undefined} aria-hidden />
        {open ? closeLabel : openLabel}
      </button>
      <div id={panelId} className={styles.menuPanel} hidden={!open} onClick={onPanelClick}>
        {open && children}
      </div>
    </>
  );
}
