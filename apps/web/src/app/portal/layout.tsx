import { DemoShell } from "@/components/demo/demo-shell";
import { PortalShell } from "@/components/portal/portal-shell";
import styles from "@/components/portal/portal.module.css";
import { requireSection } from "@/lib/auth/session";
import { getDemoInfo } from "@/lib/demo/session";
import { NoticeGate } from "@/components/portal/notice-gate";
import { noticeStatus } from "@/lib/portal/notice";
import { createClient } from "@/lib/supabase/server";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await requireSection("portal");
  // requireSection let a demo visitor through only with a live demo session.
  const demo = user.demo ? await getDemoInfo() : null;
  // T15 (H30): an ops-opened owner or an invited co-owner first records that
  // they read the KVKK notice; the portal shows the notice in place of every
  // page until then. Never for a demo visitor.
  const supabase = demo ? null : await createClient();
  const notice = supabase ? await noticeStatus(supabase) : null;
  // IP15: the "Hizmetlerim" link only for owners of a parcel whose org has
  // the service layer on.
  const services = supabase
    ? ((await supabase.rpc("portal_services_enabled")).data ?? false)
    : false;
  return (
    // The wrapper lets the portal's print styles hide the shared header.
    <div className={styles.portal}>
      {demo ? (
        <DemoShell info={demo}>{children}</DemoShell>
      ) : (
        <PortalShell user={user} services={services}>
          {/* The header links to applications, orders and the account only
              for users with an owner profile (customer), including pilot
              owners and co-owners ops gave one. A co-owner (viewer) without a
              profile sees only the gardens. */}
          {notice?.required && notice.version ? <NoticeGate version={notice.version} /> : children}
        </PortalShell>
      )}
    </div>
  );
}
