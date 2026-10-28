import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { t } from "@/lib/i18n";
import { LogoMark } from "@/components/brand/logo";
import { DemoContinue } from "@/components/site/demo-continue";
import { DemoLink } from "@/components/site/demo-link";
import { SignupLink } from "@/components/site/signup-link";
import { siteFlags } from "@/lib/flags";
import { LoginForm } from "./login-form";
import { loginMethodParam, safeNextPath } from "./login-methods";
import styles from "./login.module.css";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; yontem?: string | string[] }>;
}) {
  const { next, yontem } = await searchParams;
  const target = safeNextPath(next);
  const user = await getSessionUser();
  if (user && !user.demo) redirect(target);
  const flags = siteFlags();

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
          {user?.demo ? (
            <DemoContinue next="/giris" />
          ) : (
            <>
              <LoginForm next={target} initialMethod={loginMethodParam(yontem)} />
              <div className={styles.signup}>
                <SignupLink signupEnabled={flags.signupEnabled} />
                <DemoLink demoUrl={flags.demoUrl} />
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
