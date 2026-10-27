import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import styles from "@/components/site/site.module.css";
import { defaultSection } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/auth/session";
import { siteFlags } from "@/lib/flags";
import { t } from "@/lib/i18n";
import { siteText } from "@/lib/i18n/messages/site";
import { completeSignup } from "@/lib/signup/client";
import { createClient } from "@/lib/supabase/server";
import type { Client } from "@/lib/supabase/types";

// `/` (docs/musteri-yonetimi.md §9): the landing page when signed out; the
// user's section when they have one. A self-service sign-up that stopped
// after the SMS code is finished here; one that never verified its phone is
// sent to /kayit/dogrula. Only self-service accounts (app_metadata.signup =
// "self", set by customer-signup) are asked; any other account without a role
// sees the no-roles card.
export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) return <Landing signupEnabled={siteFlags().signupEnabled} />;

  const section = defaultSection(user.roles);
  if (section) redirect(`/${section}`);

  let phoneNotVerified = false;
  const supabase = await createClient();
  if (siteFlags().signupEnabled && (await isSelfSignup(supabase))) {
    const result = await completeSignup(supabase);
    if (result.ok && result.status === "completed") redirect("/portal");
    phoneNotVerified = !result.ok && result.error === "phone_not_verified";
  }

  return (
    <div className={styles.narrow}>
      <div className="card" data-testid={phoneNotVerified ? "verify-phone-card" : "no-roles-card"}>
        {phoneNotVerified ? (
          <>
            <h1>{siteText.home.verifyTitle}</h1>
            <p>{siteText.home.verifyBody}</p>
            <p>
              <Link href="/kayit/dogrula" className="button">
                {siteText.home.verifyLink}
              </Link>
            </p>
          </>
        ) : (
          <p>{t.home.noRoles}</p>
        )}
        <form action={signOut}>
          <button className="button button-secondary" type="submit">
            {t.nav.logout}
          </button>
        </form>
      </div>
    </div>
  );
}

async function isSelfSignup(supabase: Client): Promise<boolean> {
  const { data } = await supabase.auth.getClaims();
  const meta: unknown = data?.claims?.app_metadata;
  return Boolean(
    meta && typeof meta === "object" && (meta as { signup?: unknown }).signup === "self",
  );
}

function Landing({ signupEnabled }: { signupEnabled: boolean }) {
  const l = siteText.landing;
  return (
    <>
      <section className={styles.hero}>
        <div className={styles.container}>
          <p className={styles.eyebrow}>{l.eyebrow}</p>
          <h1 className={styles.heroTitle}>{l.title}</h1>
          <p className={styles.lead}>{l.lead}</p>
          <div className={styles.ctaRow}>
            {signupEnabled && (
              <Link href="/kayit" className="button">
                {l.ctaSignup}
              </Link>
            )}
            <Link
              href="/nasil-calisir"
              className={signupEnabled ? "button button-secondary" : "button"}
            >
              {l.ctaHow}
            </Link>
            <Link href="/giris">{l.ctaLogin}</Link>
          </div>
        </div>
      </section>
      <section className={styles.section}>
        <div className={styles.container}>
          <h2>{l.pillarsTitle}</h2>
          <div className={`${styles.grid} ${styles.grid4}`}>
            {l.pillars.map((pillar) => (
              <div key={pillar.title} className={styles.tile}>
                <h3>{pillar.title}</h3>
                <p>{pillar.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className={styles.section}>
        <div className={`${styles.container} ${styles.grid}`}>
          <div className={styles.tile}>
            <h2>{l.getTitle}</h2>
            <ul className={styles.checkList}>
              {l.get.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className={styles.tile}>
            <h2>{l.honestTitle}</h2>
            <ul className={styles.crossList}>
              {l.honest.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
