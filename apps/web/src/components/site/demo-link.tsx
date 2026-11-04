import Link from "next/link";
import { siteText } from "@/lib/i18n/messages/site";
import styles from "./auth.module.css";

// The demo under the login card, only when this site links to a demo
// (siteFlags().demoUrl; docs/demo-turu.md §11.1).
export function DemoLink({ demoUrl }: { demoUrl: string | null }) {
  if (!demoUrl) return null;
  return (
    <p className={styles.below} data-testid="login-demo">
      {siteText.login.demoBefore} <Link href={demoUrl}>{siteText.login.tryDemo}</Link>
    </p>
  );
}
