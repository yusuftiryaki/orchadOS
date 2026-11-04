import Link from "next/link";
import type { ReactNode } from "react";
import { IconCard, IconFileText, IconShield, IconUser } from "@/components/ui/icons";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { portalHref } from "@/lib/portal-billing/urls";
import s from "./workspace.module.css";

const S = P.settings;

export type SettingsPage = "profile" | "billing" | "contracts" | "consents";

// Hesabım and its pages as one settings area (wave 4): a sub-navigation that
// mirrors the account menu (Hesabım, Sözleşmelerim, İzinler) plus the
// billing profile, on the left from a laptop up and as a scrolling row on a
// phone; the page itself on the right.
export function SettingsShell({
  current,
  children,
}: {
  current: SettingsPage;
  children: ReactNode;
}) {
  const items: {
    key: SettingsPage;
    href: string;
    label: string;
    icon: ReactNode;
    testId?: string;
  }[] = [
    { key: "profile", href: portalHref.account(), label: S.profile, icon: <IconUser size={18} /> },
    { key: "billing", href: portalHref.billing(), label: S.billing, icon: <IconCard size={18} /> },
    {
      key: "contracts",
      href: "/portal/hesap/sozlesmeler",
      label: S.contracts,
      icon: <IconFileText size={18} />,
      testId: "account-contracts",
    },
    {
      key: "consents",
      href: portalHref.consents(),
      label: S.consents,
      icon: <IconShield size={18} />,
      testId: "account-consents",
    },
  ];
  return (
    <div className={s.settings}>
      <nav className={s.settingsNav} aria-label={S.label}>
        <ul>
          {items.map((item) => (
            <li key={item.key} data-testid={item.testId}>
              <Link href={item.href} aria-current={item.key === current ? "page" : undefined}>
                {item.icon}
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className={s.settingsBody}>{children}</div>
    </div>
  );
}

// One settings section: the title and what it is for on the left, the
// content (a form card, a list) on the right on a wide screen.
export function Setting({
  title,
  description,
  children,
  id,
  testId,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  id: string;
  testId?: string;
}) {
  return (
    <section className={s.setting} id={id} aria-labelledby={`${id}-title`} data-testid={testId}>
      <div className={s.settingText}>
        <h2 id={`${id}-title`} className={s.settingTitle}>
          {title}
        </h2>
        {description && <p className={s.settingDescription}>{description}</p>}
      </div>
      <div className={s.settingContent}>{children}</div>
    </section>
  );
}
