import { InlineText } from "@/components/site/legal-document";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { IconCheck } from "@/components/ui/icons";
import { demoText } from "@/lib/i18n/messages/demo";
import type { WebCaptchaProvider } from "@/lib/site/captcha";
import { DemoStartForm } from "./demo-start-form";
import styles from "./demo-page.module.css";

const d = demoText.start;

// Content of /demo; the page decides who sees it. The start card comes first
// on a phone and stays beside the text on a wide screen: what the demo shows,
// then the data and privacy notes in smaller print.
export function DemoStartView({
  ended,
  signedIn,
  turnstileSiteKey,
  captchaProvider,
}: {
  ended: boolean;
  signedIn: boolean;
  turnstileSiteKey: string | null;
  captchaProvider?: WebCaptchaProvider;
}) {
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>{d.title}</h1>
        <p className={styles.lead}>{d.lead}</p>
      </header>
      <div className={styles.layout}>
        <aside className={styles.start} aria-labelledby="demo-baslat">
          {ended && (
            <div data-testid="demo-ended">
              <Alert tone="info" role="status" title={d.endedTitle}>
                <p>{d.endedBody}</p>
              </Alert>
            </div>
          )}
          {signedIn ? (
            <div data-testid="demo-signed-in" className={styles.startBody}>
              <h2 id="demo-baslat">{d.signedInTitle}</h2>
              <p>{d.signedInBody}</p>
              <ButtonLink href="/" variant="secondary" block>
                {d.signedInBack}
              </ButtonLink>
            </div>
          ) : (
            <div className={styles.startBody}>
              <h2 id="demo-baslat">{d.panelTitle}</h2>
              <p>{d.panelBody}</p>
              <DemoStartForm
                turnstileSiteKey={turnstileSiteKey}
                captchaProvider={captchaProvider}
                label={ended ? d.restart : d.button}
              />
            </div>
          )}
        </aside>
        <div className={styles.content}>
          <section aria-labelledby="demo-neler">
            <h2 id="demo-neler" className={styles.subhead}>
              {d.seeTitle}
            </h2>
            <ul className={styles.see}>
              {d.see.map((item) => (
                <li key={item}>
                  <IconCheck size={18} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
          <div className={styles.fine}>
            {(
              [
                ["veriler", d.dataTitle, d.data],
                ["gizlilik", d.privacyTitle, d.privacy],
              ] as const
            ).map(([id, title, items]) => (
              <section key={id} aria-labelledby={`demo-${id}`}>
                <h2 id={`demo-${id}`}>{title}</h2>
                <ul>
                  {items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <p className={styles.note}>
            <InlineText text={d.privacyLink} />
          </p>
        </div>
      </div>
    </div>
  );
}
