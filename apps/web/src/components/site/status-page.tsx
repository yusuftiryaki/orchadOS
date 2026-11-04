import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/brand/logo";
import { t } from "@/lib/i18n";
import styles from "./status-page.module.css";

// A whole-screen message outside any section (404, 403, a failed request): the
// brand leads home, a quiet icon and code, one heading says what happened, the
// body what to do, then the way back.
export function StatusPage({
  code,
  icon,
  title,
  children,
  action,
  testId,
}: {
  code?: string;
  icon?: ReactNode;
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
        {icon && (
          <span className={styles.icon} aria-hidden>
            {icon}
          </span>
        )}
        {code && <p className={styles.code}>{code}</p>}
        <h1>{title}</h1>
        <div className={styles.text}>{children}</div>
        <div className={styles.action}>{action}</div>
      </div>
    </main>
  );
}
