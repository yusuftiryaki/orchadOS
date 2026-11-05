"use client";

import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { IconClose, IconMenu } from "@/components/ui/icons";
import styles from "./site.module.css";

// The phone menu of the site header: one icon button that opens the links
// below the bar, over a scrim. A link click, a tap on the scrim or Escape
// closes it; Escape returns focus to the button.
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
        {open ? <IconClose size={22} /> : <IconMenu size={22} />}
        <span className="sr-only">{open ? closeLabel : openLabel}</span>
      </button>
      {open && <div className={styles.menuScrim} onClick={() => setOpen(false)} aria-hidden />}
      <div id={panelId} className={styles.menuPanel} hidden={!open} onClick={onPanelClick}>
        {open && children}
      </div>
    </>
  );
}
