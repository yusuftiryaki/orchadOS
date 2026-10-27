import type { Metadata } from "next";
import styles from "@/components/site/site.module.css";
import { siteText } from "@/lib/i18n/messages/site";

const h = siteText.how;

export const metadata: Metadata = { title: h.title, description: h.lead };

export default function HowItWorksPage() {
  return (
    <div className={styles.container}>
      <header className={styles.pageHead}>
        <h1>{h.title}</h1>
        <p className={styles.lead}>{h.lead}</p>
      </header>
      <ol className={`${styles.grid} ${styles.grid3} ${styles.plainList}`}>
        {h.steps.map((step) => (
          <li key={step.title} className={styles.tile}>
            <h2>{step.title}</h2>
            <p>{step.body}</p>
          </li>
        ))}
      </ol>
      <section className={styles.section}>
        <div className={styles.tile}>
          <h2>{h.scopeTitle}</h2>
          <ul className={styles.crossList}>
            {h.outOfScope.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
