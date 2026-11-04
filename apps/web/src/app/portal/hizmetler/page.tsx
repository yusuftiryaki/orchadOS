import Link from "next/link";
import { listClass, workClass as w } from "@/components/portal-billing/workspace";
import layout from "@/components/portal/page.module.css";
import { RobotBadge } from "@/components/services/robot-badge";
import styles from "@/components/services/services.module.css";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { IconTool } from "@/components/ui/icons";
import { statusTone } from "@/components/ui/status";
import { requireSection } from "@/lib/auth/session";
import { servicesText as S } from "@/lib/i18n/messages/services";
import { listServiceRequests } from "@/lib/services/data";
import { formatTl, longDate } from "@/lib/services/format";
import { requestAmount, requestDateLine, serviceErrorText } from "@/lib/services/requests";
import { serviceHref } from "@/lib/services/urls";
import { createClient } from "@/lib/supabase/server";

// "Hizmetlerim" (IP15): the owner's service requests and pre-requests, newest
// first: number, garden, service, the robot, state, the date that matters for the state
// and the amount (the confirmed one, else the frozen estimate, else "Fiyat
// teklifle bildirilir" when the service had no published price). Row level
// security shows owners their parcels' requests; a co-owner sees none.
export default async function ServiceRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSection("portal");
  const [requests, params] = await Promise.all([
    createClient().then(listServiceRequests),
    searchParams,
  ]);
  const error = serviceErrorText(params.hata);
  return (
    <main className={layout.page}>
      <PageHeader title={S.list.title} lead={S.list.lead} />
      {error && (
        <Alert tone="danger" role="alert">
          <p>{error}</p>
        </Alert>
      )}
      {requests.length === 0 ? (
        <EmptyState
          title={S.list.emptyTitle}
          testId="service-requests-empty"
          action={<ButtonLink href="/portal">{S.list.emptyAction}</ButtonLink>}
        >
          <p>{S.list.emptyBody}</p>
        </EmptyState>
      ) : (
        <ul className={`${w.rows} ${w.linkRows}`} data-testid="service-request-list">
          {requests.map((r) => {
            const amount = requestAmount(r);
            const name = S.shortName[r.serviceCode] ?? r.serviceName;
            return (
              <li key={r.id} data-request-id={r.id} data-status={r.status}>
                <div className={w.withTile}>
                  <span className={w.tile}>
                    <IconTool />
                  </span>
                  <div className={w.rowBody}>
                    <Link href={serviceHref.request(r.id)} className={listClass.rowLink}>
                      {`${name}: ${r.parcelName}`}
                    </Link>
                    <p className={w.rowMeta}>
                      <span className={layout.nowrap}>{r.number}</span> ·{" "}
                      {requestDateLine(r, longDate)}
                    </p>
                    {r.robot && (
                      <span className={w.rowExtra}>
                        <RobotBadge robot={r.robot} compact />
                      </span>
                    )}
                  </div>
                </div>
                <div className={w.rowSide}>
                  <Badge tone={statusTone(r.status)}>{S.status[r.status]}</Badge>
                  <span className={styles.amount} data-testid="service-request-amount">
                    {amount ? (
                      <>
                        {formatTl(amount.kurus)}
                        {!amount.confirmed && (
                          <span className={styles.meta}> ({S.list.notConfirmed})</span>
                        )}
                      </>
                    ) : (
                      <span className={styles.meta}>{S.card.noPrice}</span>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
