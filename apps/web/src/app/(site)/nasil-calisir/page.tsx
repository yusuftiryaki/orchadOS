import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/components/site/site.module.css";
import { siteFlags } from "@/lib/flags";
import { demoText } from "@/lib/i18n/messages/demo";
import { siteText } from "@/lib/i18n/messages/site";

const h = siteText.how;

export const metadata: Metadata = { title: h.title, description: h.lead };

export default function HowItWorksPage() {
  const { demoUrl } = siteFlags();
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
      {demoUrl && (
        <section className={styles.section}>
          <div className={styles.tile} data-testid="how-demo">
            <h2>{demoText.howTile.title}</h2>
            <p>{demoText.howTile.body}</p>
            <p className={styles.tileFoot}>
              <Link href={demoUrl} className="button">
                {demoText.howTile.cta}
              </Link>
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
