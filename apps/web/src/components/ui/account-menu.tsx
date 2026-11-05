"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { signOut } from "@/app/actions";
import { t } from "@/lib/i18n";
import styles from "./account-menu.module.css";
import { IconChevronDown, IconLogOut } from "./icons";

export interface AccountMenuLink {
  href: string;
  label: string;
  icon?: ReactNode;
}

// The account corner of a signed-in header: the user's initial opens a small
// menu with the account pages, other sections and "Çıkış". A disclosure (a
// button and a list of links), not an ARIA menu: Tab moves through the links,
// Escape and a click outside close it, and it closes on navigation.
export function AccountMenu({
  email,
  name,
  links,
  sections = [],
}: {
  email: string | null;
  name?: string | null;
  links: AccountMenuLink[];
  sections?: AccountMenuLink[];
}) {
  const path = usePathname();
  // Open for the path it was opened on: a navigation closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn !== null && openOn === path;
  const setOpen = (value: boolean) => setOpenOn(value ? path : null);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpenOn(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenOn(null);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initial = (name || email || "?").trim().slice(0, 1).toLocaleUpperCase("tr-TR");
  return (
    <div className={styles.root} ref={ref}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={id}
        aria-label={t.nav.accountMenu}
        onClick={() => setOpen(!open)}
      >
        <span className={styles.avatar} aria-hidden>
          {initial}
        </span>
        <IconChevronDown size={16} className={styles.chevron} />
      </button>
      <div id={id} className={styles.panel} hidden={!open}>
        <div className={styles.who}>
          {name && <span className={styles.name}>{name}</span>}
          <span className={styles.email} data-testid="user-email">
            {email}
          </span>
        </div>
        {links.length > 0 && (
          <ul className={styles.list}>
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className={styles.item}
                  aria-current={path === l.href ? "page" : undefined}
                >
                  {l.icon}
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {sections.length > 0 && (
          <ul className={styles.list} aria-label={t.nav.otherSections}>
            {sections.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={styles.item}>
                  {l.icon}
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <form action={signOut} className={styles.list}>
          <button type="submit" className={styles.item}>
            <IconLogOut size={18} />
            {t.nav.logout}
          </button>
        </form>
      </div>
    </div>
  );
}
