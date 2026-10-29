import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import styles from "@/components/site/site.module.css";
import { getSessionUser } from "@/lib/auth/session";
import { siteFlags } from "@/lib/flags";
import { getCompanyInfo } from "@/lib/legal/company-info";

// Public site: landing, product pages, legal texts and sign-up. Signed-out
// visitors may open these (src/lib/site/public-paths.ts).
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [user, company] = await Promise.all([getSessionUser(), getCompanyInfo()]);
  const { signupEnabled, demoUrl } = siteFlags();
  return (
    <div className={styles.shell}>
      <SiteHeader
        signedIn={user !== null}
        signupEnabled={signupEnabled}
        demoUrl={demoUrl}
        demo={user?.demo ?? false}
      />
      <main className={styles.main}>{children}</main>
      <SiteFooter company={company} />
    </div>
  );
}
