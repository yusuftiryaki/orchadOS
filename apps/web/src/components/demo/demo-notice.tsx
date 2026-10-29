import { demoText } from "@/lib/i18n/messages/demo";
import styles from "./demo.module.css";

// In place of a form a demo visitor cannot use (docs/demo-turu.md §11.5).
export function DemoNotice({ text = demoText.closed.generic }: { text?: string }) {
  return (
    <p className={styles.notice} role="note" data-testid="demo-notice">
      {text}
    </p>
  );
}
