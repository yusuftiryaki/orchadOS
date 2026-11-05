import { demoText } from "@/lib/i18n/messages/demo";
import styles from "./auth.module.css";
import { DemoExitButton } from "./demo-exit-button";

// /giris and /kayit for a demo visitor: the demo session ends first, then the
// page opens (on a demo host, on the main site).
export function DemoContinue({ next }: { next: "/giris" | "/kayit" }) {
  return (
    <div className={styles.demoContinue} data-testid="demo-continue">
      <p>{demoText.site.inDemo}</p>
      <DemoExitButton next={next} label={demoText.site.exitAndContinue} className="button" />
    </div>
  );
}
