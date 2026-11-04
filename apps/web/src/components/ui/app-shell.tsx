import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/brand/logo";
import { t } from "@/lib/i18n";
import styles from "./app-shell.module.css";
import { CurrentIntoView } from "./current-into-view";

export interface NavItem {
  href: string;
  label: ReactNode;
  current?: boolean;
  // Shown above the label in the portal's bottom bar on a phone, before it
  // on wider screens.
  icon?: ReactNode;
}

// Header and frame of a signed-in section. "portal": owners, phone first,
// 1120px wide; on a phone the section links move to a bottom tab bar, the
// standard place for an app's top-level destinations within thumb reach. "staff": ofis, operasyon, uzman and back office, 1440px wide
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
    <div
      className={staff ? styles.staff : styles.portal}
      data-density={dense ? "compact" : undefined}
      data-bottom-nav={!staff && nav.length > 1 ? "" : undefined}
    >
      <header className={styles.header} data-density={staff ? "compact" : undefined}>
        <div className={styles.inner}>
          <Link href="/" className={styles.brand}>
            <LogoMark />
            <span>{t.app.name}</span>
          </Link>
          {nav.length > 0 && (
            <CurrentIntoView label={navLabel} className={styles.nav}>
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={styles.link}
                  aria-current={item.current ? "page" : undefined}
                >
                  {item.icon && <span className={styles.icon}>{item.icon}</span>}
                  <span className={styles.label}>{item.label}</span>
                </Link>
              ))}
            </CurrentIntoView>
          )}
          {account && <div className={styles.account}>{account}</div>}
        </div>
      </header>
      <div className={styles.main}>{children}</div>
    </div>
  );
}
