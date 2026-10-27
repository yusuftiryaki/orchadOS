import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import styles from "@/components/site/site.module.css";
import { getSessionUser } from "@/lib/auth/session";
import { siteFlags } from "@/lib/flags";

// Public site: landing, product pages, legal texts and sign-up. Signed-out
// visitors may open these (src/lib/site/public-paths.ts).
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const { signupEnabled } = siteFlags();
  return (
    <div className={styles.shell}>
      <SiteHeader signedIn={user !== null} signupEnabled={signupEnabled} />
      <main className={styles.main}>{children}</main>
      <SiteFooter />
    </div>
  );
}
