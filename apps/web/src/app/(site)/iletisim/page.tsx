import type { Metadata } from "next";
import { Fragment } from "react";
import styles from "@/components/site/site.module.css";
import { siteText } from "@/lib/i18n/messages/site";

const c = siteText.contact;

export const metadata: Metadata = { title: c.title };

// No contact form in İP12 (design §1); addresses are placeholders until the
// company details are known.
export default function ContactPage() {
  return (
    <div className={styles.container}>
      <header className={styles.pageHead}>
        <h1>{c.title}</h1>
        <p className={styles.lead}>{c.lead}</p>
      </header>
      <div className={styles.tile}>
        <dl className={styles.dl}>
          {c.items.map((item) => (
            <Fragment key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </Fragment>
          ))}
        </dl>
        <p className={styles.tileFoot}>{c.hours}</p>
      </div>
    </div>
  );
}
