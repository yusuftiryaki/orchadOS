import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import styles from "@/components/site/pages.module.css";
import { InlineText } from "@/components/site/legal-document";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { DEMO_END_PATH, demoGate, getSessionUser } from "@/lib/auth/session";
import { siteFlags } from "@/lib/flags";
import { demoText } from "@/lib/i18n/messages/demo";
import { DemoStartForm } from "./demo-start-form";

const d = demoText.start;

export const metadata: Metadata = { title: d.title, description: d.metaDescription };

// /demo (docs/demo-turu.md §11.2): what the demo shows, what it keeps, and the
// start button. Only where this deployment serves the demo. ?bitti=1 after a
// demo ended.
export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ bitti?: string | string[] }>;
}) {
  const flags = siteFlags();
  if (!flags.demoEnabled) notFound();
  const user = await getSessionUser();
  const { bitti } = await searchParams;
  const ended = bitti === "1";
  // A live demo session goes back to the portal; an ended one that still has
  // its cookie goes to /demo/bitti once, which clears it. On ?bitti=1 the page
  // renders whatever the session says, so the two can never bounce.
  if (user?.demo && !ended) redirect((await demoGate(user)) ? "/portal" : DEMO_END_PATH);

  const lists: [string, string, readonly string[]][] = [
    ["neler", d.seeTitle, d.see],
    ["veriler", d.dataTitle, d.data],
    ["gizlilik", d.privacyTitle, d.privacy],
  ];
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>{d.title}</h1>
        <p className={styles.lead}>{d.lead}</p>
      </header>
      <div className={`${styles.split} ${styles.demoSplit}`}>
        <aside className={styles.startPanel} aria-labelledby="demo-baslat">
          {ended && (
            <div data-testid="demo-ended">
              <Alert tone="info" role="status" title={d.endedTitle}>
                <p>{d.endedBody}</p>
              </Alert>
            </div>
          )}
          {user && !user.demo ? (
            <div data-testid="demo-signed-in">
              <h2 id="demo-baslat">{d.signedInTitle}</h2>
              <p>{d.signedInBody}</p>
              <p>
                <ButtonLink href="/" variant="secondary">
                  {d.signedInBack}
                </ButtonLink>
              </p>
            </div>
          ) : (
            <>
              <h2 id="demo-baslat">{d.panelTitle}</h2>
              <p>{d.panelBody}</p>
              <DemoStartForm
                turnstileSiteKey={flags.turnstileSiteKey}
                captchaProvider={flags.captchaProvider}
                label={ended ? d.restart : d.button}
              />
            </>
          )}
        </aside>
        <div>
          {lists.map(([id, title, items]) => (
            <section key={id} aria-labelledby={`demo-${id}`}>
              <h2 id={`demo-${id}`} className={styles.subhead}>
                {title}
              </h2>
              <ul className={styles.list}>
                {items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
          <p className={styles.note}>
            <InlineText text={d.privacyLink} />
          </p>
        </div>
      </div>
    </div>
  );
}
