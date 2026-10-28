import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/components/site/pages.module.css";
import { siteText } from "@/lib/i18n/messages/site";

const f = siteText.faq;

export const metadata: Metadata = { title: f.title, description: f.lead };

export default function FaqPage() {
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>{f.title}</h1>
        <p className={styles.lead}>{f.lead}</p>
      </header>
      <div className={styles.faq}>
        {f.items.map((item) => (
          <details key={item.q}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
      <section className={styles.more} aria-labelledby="daha-fazla">
        <h2 id="daha-fazla">{f.moreTitle}</h2>
        <p>
          {f.moreBody} <Link href="/iletisim">{f.moreLink}</Link>
        </p>
      </section>
    </div>
  );
}
