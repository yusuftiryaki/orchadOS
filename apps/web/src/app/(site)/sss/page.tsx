import type { Metadata } from "next";
import styles from "@/components/site/pages.module.css";
import { ButtonLink } from "@/components/ui/button";
import { IconChevronDown } from "@/components/ui/icons";
import { siteText } from "@/lib/i18n/messages/site";

const f = siteText.faq;

export const metadata: Metadata = { title: f.title, description: f.lead };

// Questions in one accordion; on a wide screen the title and the way to ask
// a question of one's own stay in a column beside it.
export default function FaqPage() {
  return (
    <div className={`${styles.page} ${styles.faqLayout}`}>
      <header className={`${styles.head} ${styles.faqHead}`}>
        <h1 className={styles.title}>{f.title}</h1>
        <p className={styles.lead}>{f.lead}</p>
      </header>
      <div className={styles.faq}>
        {f.items.map((item) => (
          <details key={item.q}>
            <summary>
              <span>{item.q}</span>
              <span className={styles.chevron} aria-hidden>
                <IconChevronDown size={18} />
              </span>
            </summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
      <section className={styles.more} aria-labelledby="daha-fazla">
        <h2 id="daha-fazla">{f.moreTitle}</h2>
        <p>{f.moreBody}</p>
        <ButtonLink href="/iletisim" variant="secondary">
          {f.moreLink}
        </ButtonLink>
      </section>
    </div>
  );
}
