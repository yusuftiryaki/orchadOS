import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/brand/logo";
import { t } from "@/lib/i18n";
import styles from "./status-page.module.css";

// A whole-screen message outside any section (404, 403): the brand leads
// home, one heading says what happened, the body what to do, one action.
export function StatusPage({
  code,
  title,
  children,
  action,
  testId,
}: {
  code: string;
  title: string;
  children: ReactNode;
  action: ReactNode;
  testId?: string;
}) {
  return (
    <main className={styles.screen}>
      <Link href="/" className={styles.brand}>
        <LogoMark size={28} />
        <span>{t.app.name}</span>
      </Link>
      <div className={styles.body} data-testid={testId}>
        {/* An empty planting row: the orchard grid with no tree in it. */}
        <span className={styles.rows} aria-hidden />
        <p className={styles.code}>{code}</p>
        <h1>{title}</h1>
        <div className={styles.text}>{children}</div>
        <div className={styles.action}>{action}</div>
      </div>
    </main>
  );
}
