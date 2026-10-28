import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import styles from "@/components/demo/demo.module.css";
import { InlineText } from "@/components/site/legal-document";
import { getSessionUser } from "@/lib/auth/session";
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
  if (user?.demo) redirect("/portal");
  const { bitti } = await searchParams;
  const ended = bitti === "1";

  return (
    <div className={styles.start}>
      {ended && (
        <div className={styles.endedCard} role="status" data-testid="demo-ended">
          <h2>{d.endedTitle}</h2>
          <p>{d.endedBody}</p>
        </div>
      )}
      <h1>{d.title}</h1>
      <p className="muted">{d.lead}</p>
      <h2>{d.seeTitle}</h2>
      <ul>
        {d.see.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h2>{d.dataTitle}</h2>
      <ul>
        {d.data.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h2>{d.privacyTitle}</h2>
      <ul>
        {d.privacy.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p>
        <InlineText text={d.privacyLink} />
      </p>
      {user ? (
        <div className={styles.endedCard} data-testid="demo-signed-in">
          <h2>{d.signedInTitle}</h2>
          <p>{d.signedInBody}</p>
          <p>
            <Link href="/">{d.signedInBack}</Link>
          </p>
        </div>
      ) : (
        <DemoStartForm
          turnstileSiteKey={flags.turnstileSiteKey}
          label={ended ? d.restart : d.button}
        />
      )}
    </div>
  );
}
