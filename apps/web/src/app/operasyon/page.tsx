import Link from "next/link";
import { OpsNav } from "@/components/operations/ops-nav";
import { ResultNotice } from "@/components/operations/result-notice";
import { ExpertRequests } from "@/components/operations/expert-requests";
import { ViewerInvitations } from "@/components/operations/viewer-invitations";
import { listFollowups } from "@/lib/expert/followups";
import styles from "@/components/operations/operations.module.css";
import { VisitTable } from "@/components/operations/visit-table";
import { requireSection } from "@/lib/auth/session";
import { formatNumber, t } from "@/lib/i18n";
import { listFieldStaff, listVisits, opsOrgs } from "@/lib/operations/data";
import { listViewerInvitations } from "@/lib/operations/invitations";
import { opsHref } from "@/lib/operations/urls";
import {
  countByStatus,
  overdueVisits,
  PIPELINE_STATUSES,
  todayIn,
  UPCOMING_DAYS,
  upcomingVisits,
} from "@/lib/operations/visits";
import { listParcels } from "@/lib/parcels";
import { createClient } from "@/lib/supabase/server";

const T = t.operations;

// Operations dashboard: visits by status, upcoming and late work, parcels
// with their life cycle status; open viewer invitations from owners.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("operasyon");
  const supabase = await createClient();
  const now = new Date();
  const [visits, parcels, orgs] = await Promise.all([
    listVisits(supabase),
    listParcels(supabase),
    opsOrgs(supabase, user.id),
  ]);
  const [staff, followups, invitations] = await Promise.all([
    listFieldStaff(supabase, orgs),
    listFollowups(supabase, { statuses: ["open", "planned"] }),
    listViewerInvitations(
      supabase,
      orgs.map((o) => o.id),
    ),
  ]);
  const leads = new Map(staff.map((s) => [s.userId, s.email]));

  const counts = countByStatus(visits);
  const upcoming = upcomingVisits(visits, todayIn(now));
  const overdue = overdueVisits(visits, now);
  const lateReasons = new Map(
    overdue.map((o) => [o.visit.id, T.dashboard.overdueReason[o.reason](o.days)]),
  );

  return (
    <main className="page">
      <OpsNav current="dashboard" />
      <h1>{T.dashboard.title}</h1>
      <ResultNotice params={await searchParams} />
      {invitations.length > 0 && (
        <ViewerInvitations invitations={invitations} today={todayIn(now)} />
      )}
      {followups.length > 0 && (
        <ExpertRequests
          followups={followups}
          parcels={new Map(parcels.map((p) => [p.id, p.name]))}
          visits={visits.filter((v) => v.status === "planned")}
        />
      )}

      <h2>{T.dashboard.counts}</h2>
      <ul className={styles.stats} data-testid="visit-counts">
        {PIPELINE_STATUSES.map((status) => (
          <li key={status}>
            <Link
              className={styles.stat}
              href={opsHref.visits({ durum: status })}
              data-status={status}
            >
              <span className={styles.statValue}>{formatNumber(counts[status])}</span>
              {t.office.sessionStatus[status]}
            </Link>
          </li>
        ))}
      </ul>

      <h2>{T.dashboard.upcoming(UPCOMING_DAYS)}</h2>
      {upcoming.length === 0 ? (
        <p className="muted">{T.dashboard.noUpcoming}</p>
      ) : (
        <VisitTable visits={upcoming} leads={leads} testId="upcoming-visits" />
      )}

      <h2>{T.dashboard.overdue}</h2>
      {overdue.length === 0 ? (
        <p className="muted">{T.dashboard.noOverdue}</p>
      ) : (
        <VisitTable
          visits={overdue.map((o) => o.visit)}
          leads={leads}
          late={lateReasons}
          testId="overdue-visits"
        />
      )}

      <h2>{T.dashboard.parcels}</h2>
      {parcels.length === 0 ? (
        <p className="muted">{T.dashboard.noParcels}</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table} data-testid="parcel-list">
            <thead>
              <tr>
                <th>{t.parcels.columns.name}</th>
                <th>{t.parcels.columns.location}</th>
                <th className={styles.number}>{t.parcels.columns.area}</th>
                <th className={styles.number}>{t.parcels.columns.trees}</th>
                <th>{T.parcel.lifecycle}</th>
              </tr>
            </thead>
            <tbody>
              {parcels.map((parcel) => (
                <tr key={parcel.id} data-parcel-id={parcel.id}>
                  <td>
                    <Link href={opsHref.parcel(parcel.id)}>{parcel.name}</Link>
                  </td>
                  <td>
                    {[parcel.village, parcel.district, parcel.province].filter(Boolean).join(", ")}
                  </td>
                  <td className={styles.number}>
                    {parcel.estimated_area_m2 != null &&
                      `${formatNumber(parcel.estimated_area_m2)} ${t.parcels.areaUnit}`}
                  </td>
                  <td className={styles.number}>
                    {parcel.estimated_tree_count != null &&
                      formatNumber(parcel.estimated_tree_count)}
                  </td>
                  <td>
                    <span className={styles.badge}>{t.parcels.status[parcel.status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
