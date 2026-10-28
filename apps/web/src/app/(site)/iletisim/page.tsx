import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/components/site/pages.module.css";
import { EmptyState } from "@/components/ui/empty-state";
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
          <div>
            <dt>{c.phone}</dt>
            <dd>
              <a href={`tel:${company.phone.replace(/\s/g, "")}`}>{company.phone}</a>
            </dd>
          </div>
          <div>
            <dt>{c.email}</dt>
            <dd>
              <a href={`mailto:${company.email}`}>{company.email}</a>
            </dd>
          </div>
          <div>
            <dt>{c.kvkk}</dt>
            <dd>
              <a href={`mailto:${company.kvkk_email}`}>{company.kvkk_email}</a>
            </dd>
          </div>
          <div>
            <dt>{c.kep}</dt>
            <dd>{company.kep_address}</dd>
          </div>
          <div>
            <dt>{c.address}</dt>
            <dd>{company.address}</dd>
          </div>
          <div>
            <dt>{c.company}</dt>
            <dd>{company.legal_name}</dd>
          </div>
        </dl>
      ) : (
        <EmptyState title={c.pendingTitle} testId="contact-pending">
          <p>{c.pendingBody}</p>
        </EmptyState>
      )}
      <p className={styles.note}>
        <Link href="/sss">{c.faqLink}</Link>
      </p>
    </div>
  );
}
