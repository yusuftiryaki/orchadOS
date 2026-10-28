import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";
import { t } from "@/lib/i18n";
import { siteText } from "@/lib/i18n/messages/site";
import { SITE_NAV } from "./site-header";
import styles from "./site.module.css";

export const LEGAL_LINKS = [
  { href: "/kvkk", label: siteText.footer.legal.kvkk },
  { href: "/acik-riza", label: siteText.footer.legal.explicitConsent },
  { href: "/gizlilik", label: siteText.footer.legal.privacy },
  { href: "/mesafeli-satis", label: siteText.footer.legal.distanceSales },
  { href: "/on-bilgilendirme", label: siteText.footer.legal.preInformation },
  { href: "/iade", label: siteText.footer.legal.refund },
  { href: "/bahcede-bulunanlar", label: siteText.footer.legal.fieldNotice },
] as const;

export function SiteFooter() {
  const f = siteText.footer;
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerBrand}>
          <div className={styles.brand}>
            <LogoMark size={24} />
            <span>{t.app.name}</span>
          </div>
          <p className="muted">{t.app.tagline}</p>
          <p className={styles.footerSmall}>{f.company}</p>
          <p className={styles.footerSmall}>{f.contactLine}</p>
        </div>
        <nav aria-label={siteText.nav.label} className={styles.footerLinks}>
          {SITE_NAV.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <nav aria-label={f.legalLabel} className={styles.footerLinks}>
          {LEGAL_LINKS.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      <p className={`${styles.footerInner} ${styles.footerSmall}`}>{f.note}</p>
    </footer>
  );
}
