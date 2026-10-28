import type { Metadata } from "next";
import styles from "@/components/site/pages.module.css";
import { ButtonLink } from "@/components/ui/button";
import { siteFlags } from "@/lib/flags";
import { demoText } from "@/lib/i18n/messages/demo";
import { siteText } from "@/lib/i18n/messages/site";

const h = siteText.how;

export const metadata: Metadata = { title: h.title, description: h.lead };

export default function HowItWorksPage() {
  const { demoUrl, signupEnabled } = siteFlags();
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>{h.title}</h1>
        <p className={styles.lead}>{h.lead}</p>
      </header>

      <section className={styles.band} aria-labelledby="adimlar">
        <div className={styles.split}>
          <div>
            <h2 id="adimlar" className={styles.h2}>
              {h.stepsTitle}
            </h2>
            <ol className={styles.timeline}>
              {h.steps.map((step) => (
                <li key={step.title}>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
          <aside className={styles.side} aria-labelledby="kapsam">
            <h2 id="kapsam">{h.scopeTitle}</h2>
            <ul className={styles.dashList}>
              {h.outOfScope.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </aside>
        </div>
      </section>

      {demoUrl && (
        <section className={styles.closing} data-testid="how-demo" aria-labelledby="demo">
          <div>
            <h2 id="demo">{demoText.howTile.title}</h2>
            <p>{demoText.howTile.body}</p>
          </div>
          <div className={styles.ctaRow}>
            <ButtonLink href={demoUrl}>{demoText.howTile.cta}</ButtonLink>
            {signupEnabled && (
              <ButtonLink href="/kayit" variant="secondary">
                {h.ctaSignup}
              </ButtonLink>
            )}
          </div>
        </section>
      )}
      {!demoUrl && signupEnabled && (
        <section className={styles.closing} aria-labelledby="basvuru">
          <div>
            <h2 id="basvuru">{h.closingTitle}</h2>
            <p>{h.closingBody}</p>
          </div>
          <div className={styles.ctaRow}>
            <ButtonLink href="/kayit">{h.ctaSignup}</ButtonLink>
          </div>
        </section>
      )}
    </div>
  );
}
