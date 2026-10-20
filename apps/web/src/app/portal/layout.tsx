import { SectionShell } from "@/components/section-shell";
import styles from "@/components/portal/portal.module.css";
import { requireSection } from "@/lib/auth/session";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await requireSection("portal");
  return (
    // The wrapper lets the portal's print styles hide the shared header.
    <div className={styles.portal}>
      <SectionShell user={user} section="portal">
        {children}
      </SectionShell>
    </div>
  );
}
