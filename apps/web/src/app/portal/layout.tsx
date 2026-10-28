import { DemoShell } from "@/components/demo/demo-shell";
import { PortalNav } from "@/components/portal-billing/portal-nav";
import { SectionShell } from "@/components/section-shell";
import styles from "@/components/portal/portal.module.css";
import { requireSection } from "@/lib/auth/session";
import { getDemoInfo } from "@/lib/demo/session";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await requireSection("portal");
  // requireSection let a demo visitor through only with a live demo session.
  const demo = user.demo ? await getDemoInfo() : null;
  return (
    // The wrapper lets the portal's print styles hide the shared header.
    <div className={styles.portal}>
      {demo ? (
        <DemoShell info={demo}>{children}</DemoShell>
      ) : (
        <SectionShell user={user} section="portal">
          {/* Applications, orders and the account exist for users with an owner
              profile (customer), including pilot owners and co-owners ops gave
              one: they may apply for more gardens. A co-owner (viewer) without
              a profile sees only the gardens. */}
          {user.roles.customer && <PortalNav />}
          {children}
        </SectionShell>
      )}
    </div>
  );
}
