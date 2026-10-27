import { PortalNav } from "@/components/portal-billing/portal-nav";
import { SectionShell } from "@/components/section-shell";
import styles from "@/components/portal/portal.module.css";
import { requireSection } from "@/lib/auth/session";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await requireSection("portal");
  return (
    // The wrapper lets the portal's print styles hide the shared header.
    <div className={styles.portal}>
      <SectionShell user={user} section="portal">
        {/* Applications, orders and the account exist for customers only;
            a co-owner (viewer) without a customer profile sees the gardens. */}
        {user.roles.customer && <PortalNav />}
        {children}
      </SectionShell>
    </div>
  );
}
