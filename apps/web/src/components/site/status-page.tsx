import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/brand/logo";
import { t } from "@/lib/i18n";
import styles from "./status-page.module.css";

// A whole-screen message outside any section (404, 403, a failed request): the
// brand leads home; a planting row with one tree missing (the site's
// empty-state figure) and the code; one heading says what happened, the body
// what to do, then the way back.
export function StatusPage({
  code,
  title,
  children,
  action,
  testId,
}: {
  code?: string;
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
        <svg className={styles.row} viewBox="0 0 120 24" aria-hidden focusable="false">
          {[12, 36, 60, 84, 108].map((cx) =>
            cx === 60 ? (
              <circle key={cx} cx={cx} cy={12} r={8} className={styles.gap} />
            ) : (
              <circle key={cx} cx={cx} cy={12} r={8} className={styles.tree} />
            ),
          )}
        </svg>
        {code && <p className={styles.code}>{code}</p>}
        <h1>{title}</h1>
        <div className={styles.text}>{children}</div>
        <div className={styles.action}>{action}</div>
      </div>
    </main>
  );
}
