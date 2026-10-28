import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/brand/logo";
import { t } from "@/lib/i18n";
import styles from "./app-shell.module.css";

export interface NavItem {
  href: string;
  label: ReactNode;
  current?: boolean;
}

// Header and frame of a signed-in section. "portal": owners, phone first,
// 1120px wide. "staff": ofis, operasyon, uzman and back office, 1440px wide
// with a compact header; `dense` also applies the compact type and control
// sizes to the page content (docs/tasarim-sistemi.md §Personel).
export function AppShell({
  variant = "portal",
  dense = false,
  nav,
  navLabel,
  account,
  children,
}: {
  variant?: "portal" | "staff";
  dense?: boolean;
  nav: NavItem[];
  navLabel: string;
  // The user's name or e-mail and the logout form.
  account?: ReactNode;
  children: ReactNode;
}) {
  const staff = variant === "staff";
  return (
    <div className={staff ? styles.staff : undefined} data-density={dense ? "compact" : undefined}>
      <header className={styles.header} data-density={staff ? "compact" : undefined}>
        <div className={styles.inner}>
          <Link href="/" className={styles.brand}>
            <LogoMark />
            <span>{t.app.name}</span>
          </Link>
          {nav.length > 0 && (
            <nav aria-label={navLabel} className={styles.nav}>
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={styles.link}
                  aria-current={item.current ? "page" : undefined}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          )}
          {account && <div className={styles.account}>{account}</div>}
        </div>
      </header>
      <div className={styles.main}>{children}</div>
    </div>
  );
}
