import { OpsNav } from "@/components/operations/ops-nav";
import styles from "@/components/operations/ops-layout.module.css";
import { SectionShell } from "@/components/section-shell";
import { requireSection } from "@/lib/auth/session";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await requireSection("operasyon");
  return (
    <SectionShell user={user} section="operasyon">
      <div className={styles.layout}>
        <div className={styles.nav}>
          <OpsNav />
        </div>
        <div className={styles.content}>{children}</div>
      </div>
    </SectionShell>
  );
}
