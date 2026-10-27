import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { t } from "@/lib/i18n";
import { LogoMark } from "@/components/brand/logo";
import { SignupLink } from "@/components/site/signup-link";
import { siteFlags } from "@/lib/flags";
import { LoginForm } from "./login-form";
import { safeNextPath } from "./login-methods";
import styles from "./login.module.css";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  const target = safeNextPath(next);
  if (await getSessionUser()) redirect(target);

  return (
    <main className={styles.screen}>
      <section className={styles.brandPanel} aria-hidden>
        <div className={styles.brandTop}>
          <LogoMark size={36} />
          <span>{t.app.name}</span>
        </div>
        <div>
          <p className={styles.brandLead}>{t.app.tagline}</p>
          <p className={styles.brandText}>{t.login.pitch}</p>
        </div>
        <p className={styles.brandFoot}>{t.login.footer}</p>
      </section>
      <section className={styles.formPanel}>
        <div className={styles.card}>
          <div className={styles.mobileBrand}>
            <LogoMark size={32} />
            <span>{t.app.name}</span>
          </div>
          <h1>{t.login.title}</h1>
          <p className="muted">{t.login.subtitle}</p>
          <LoginForm next={target} />
          <div className={styles.signup}>
            <SignupLink signupEnabled={siteFlags().signupEnabled} />
          </div>
        </div>
      </section>
    </main>
  );
}
