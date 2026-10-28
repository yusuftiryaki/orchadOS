import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./page-header.module.css";

// The top of a screen: one h1, an optional lead, state badges (`meta`) and
// the screen's main actions. `back` leads one level up ("Bahçelerim").
export function PageHeader({
  title,
  lead,
  meta,
  actions,
  back,
}: {
  title: ReactNode;
  lead?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className={styles.header}>
      <div className={styles.text}>
        {back && (
          <Link href={back.href} className={styles.back}>
            {back.label}
          </Link>
        )}
        <h1 className={styles.title}>{title}</h1>
        {lead && <p className={styles.lead}>{lead}</p>}
        {meta && <div className={styles.meta}>{meta}</div>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
