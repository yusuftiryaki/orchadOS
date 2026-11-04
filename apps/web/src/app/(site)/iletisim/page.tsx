import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/components/site/pages.module.css";
import { EmptyState } from "@/components/ui/empty-state";
import {
  IconArrowRight,
  IconFileText,
  IconMail,
  IconMapPin,
  IconPhone,
  IconShield,
  IconUser,
} from "@/components/ui/icons";
import { siteText } from "@/lib/i18n/messages/site";
import { getCompanyInfo } from "@/lib/legal/company-info";
import { completeCompany } from "@/lib/legal/company-placeholders";

const c = siteText.contact;

export const metadata: Metadata = { title: c.title, description: c.lead };

// No contact form in İP12 (design §1). The details come from the seller's
// company information (public_company_info, T21), the same source as the
// footer and the legal texts; until it is complete the page says so.
export default async function ContactPage() {
  const company = completeCompany(await getCompanyInfo());
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>{c.title}</h1>
        <p className={styles.lead}>{c.lead}</p>
      </header>
      {company ? (
        <dl className={styles.contact} data-testid="contact-details">
          <ContactItem icon={<IconPhone />} label={c.phone} main>
            <a href={`tel:${company.phone.replace(/\s/g, "")}`}>{company.phone}</a>
          </ContactItem>
          <ContactItem icon={<IconMail />} label={c.email} main>
            <a href={`mailto:${company.email}`}>{company.email}</a>
          </ContactItem>
          <ContactItem icon={<IconShield />} label={c.kvkk}>
            <a href={`mailto:${company.kvkk_email}`}>{company.kvkk_email}</a>
          </ContactItem>
          <ContactItem icon={<IconFileText />} label={c.kep}>
            {company.kep_address}
          </ContactItem>
          <ContactItem icon={<IconMapPin />} label={c.address}>
            {company.address}
          </ContactItem>
          <ContactItem icon={<IconUser />} label={c.company}>
            {company.legal_name}
          </ContactItem>
        </dl>
      ) : (
        <EmptyState title={c.pendingTitle} testId="contact-pending">
          <p>{c.pendingBody}</p>
        </EmptyState>
      )}
      <p className={styles.note}>
        <Link href="/sss" className="button button-quiet">
          {c.faqLink}
          <IconArrowRight size={16} />
        </Link>
      </p>
    </div>
  );
}

function ContactItem({
  icon,
  label,
  main = false,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  main?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={main ? `${styles.contactItem} ${styles.contactMain}` : styles.contactItem}>
      <dt>
        <span className={styles.contactIcon} aria-hidden>
          {icon}
        </span>
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}
