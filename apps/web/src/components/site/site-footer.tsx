import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";
import { t } from "@/lib/i18n";
import { siteText } from "@/lib/i18n/messages/site";
import { completeCompany, type CompanyFields } from "@/lib/legal/company-placeholders";
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

// The seller's company information (H34) when complete; the placeholder
// lines otherwise (also when public_company_info is not deployed yet).
export function SiteFooter({ company }: { company?: CompanyFields | null }) {
  const f = siteText.footer;
  const c = completeCompany(company);
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerBrand}>
          <div className={styles.brand}>
            <LogoMark size={24} />
            <span>{t.app.name}</span>
          </div>
          <p className="muted">{t.app.tagline}</p>
          {c ? (
            <div data-testid="footer-company">
              <FooterLine items={f.companyFilled(c)} />
              <FooterLine items={f.taxLine(c)} />
              <FooterLine items={f.contactFilled(c)} />
            </div>
          ) : (
            <>
              <FooterLine items={f.company} />
              <FooterLine items={f.contactLine} />
            </>
          )}
        </div>
        <nav aria-label={siteText.nav.label} className={styles.footerLinks}>
          <p className={styles.footerHeading}>{f.siteHeading}</p>
          {SITE_NAV.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <nav aria-label={f.legalLabel} className={styles.footerLinks}>
          <p className={styles.footerHeading}>{f.legalLabel}</p>
          {LEGAL_LINKS.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      <p className={`${styles.footerNote} ${styles.footerSmall}`}>{f.note}</p>
    </footer>
  );
}

// One line of company facts: each fact its own item, wrapping as a whole.
function FooterLine({ items }: { items: readonly string[] }) {
  return (
    <ul className={`${styles.footerSmall} ${styles.footerLine}`}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
