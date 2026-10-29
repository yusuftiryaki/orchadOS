import type { ReactNode } from "react";
import styles from "./kbd.module.css";

// A keyboard key ("J", "Enter"). `onAccent` on a filled (primary) button.
// Decorative next to a button that already names its action: pass `hidden`.
export function Kbd({
  children,
  onAccent = false,
  hidden = false,
}: {
  children: ReactNode;
  onAccent?: boolean;
  hidden?: boolean;
}) {
  return (
    <kbd
      className={onAccent ? `${styles.kbd} ${styles.onAccent}` : styles.kbd}
      aria-hidden={hidden || undefined}
    >
      {children}
    </kbd>
  );
}
