import type { Metadata } from "next";
import styles from "@/components/site/site.module.css";
import { siteText } from "@/lib/i18n/messages/site";

const f = siteText.faq;

export const metadata: Metadata = { title: f.title };

export default function FaqPage() {
  return (
    <div className={styles.container}>
      <header className={styles.pageHead}>
        <h1>{f.title}</h1>
      </header>
      <div className={styles.faq}>
        {f.items.map((item) => (
          <details key={item.q}>
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
