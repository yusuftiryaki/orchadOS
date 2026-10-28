import Link from "next/link";
import { BillingCard } from "@/components/back-office/billing-card";
import { statusTone } from "@/components/back-office/status-tone";
import { ExpertRequests } from "@/components/operations/expert-requests";
import { opsCell, Pagination, Panel, QueueList, pageOf } from "@/components/operations/ops-ui";
import { ResultNotice } from "@/components/operations/result-notice";
import { ViewerInvitations } from "@/components/operations/viewer-invitations";
import { VisitTable } from "@/components/operations/visit-table";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, cell } from "@/components/ui/table";
import { requireSection } from "@/lib/auth/session";
import { billingSummary } from "@/lib/back-office/data";
import { listFollowups } from "@/lib/expert/followups";
import { formatNumber, t } from "@/lib/i18n";
import { listFieldStaff, listVisits, opsOrgs } from "@/lib/operations/data";
import { listViewerInvitations } from "@/lib/operations/invitations";
import { getKvkkVersions } from "@/lib/operations/kvkk-versions";
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

// Operations dashboard: what needs action today first (late work, the
// customer and payment queues, open requests), then visits by status and the
// parcels with their life cycle status.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("operasyon");
  const supabase = await createClient();
  const now = new Date();
  const params = await searchParams;
  // Staff, invitations and the billing summary wait for the orgs only.
  const orgsP = opsOrgs(supabase, user.id);
  const [visits, parcels, followups, kvkkVersions, staff, invitations, billing] = await Promise.all(
    [
      listVisits(supabase),
      listParcels(supabase),
      listFollowups(supabase, { statuses: ["open", "planned"] }),
      getKvkkVersions(supabase),
      orgsP.then((orgs) => listFieldStaff(supabase, orgs)),
      orgsP.then((orgs) =>
        listViewerInvitations(
          supabase,
          orgs.map((o) => o.id),
        ),
      ),
      orgsP.then((orgs) => billingSummary(supabase, orgs)),
    ],
  );
  const leads = new Map(staff.map((s) => [s.userId, s.email]));

  const counts = countByStatus(visits);
  const upcoming = upcomingVisits(visits, todayIn(now));
  const overdue = overdueVisits(visits, now);
  const lateReasons = new Map(
    overdue.map((o) => [o.visit.id, T.dashboard.overdueReason[o.reason](o.days)]),
  );
  const parcelPage = pageOf(parcels, params.sayfa);

  return (
    <main className="page">
      <PageHeader
        title={T.dashboard.title}
        actions={
          <>
            <ButtonLink href={opsHref.newVisit()}>{T.nav.newVisit}</ButtonLink>
            <ButtonLink variant="secondary" href={opsHref.newOwner()}>
              {T.nav.newOwner}
            </ButtonLink>
            <ButtonLink variant="secondary" href={opsHref.newParcel()}>
              {T.nav.newParcel}
            </ButtonLink>
          </>
        }
      />
      <ResultNotice params={params} />

      {overdue.length > 0 && (
        <Panel plain title={T.dashboard.overdue} id="overdue">
          <VisitTable
            visits={overdue.map((o) => o.visit)}
            leads={leads}
            late={lateReasons}
            testId="overdue-visits"
          />
        </Panel>
      )}

      {billing && <BillingCard summary={billing} />}

      <Panel
        title={T.dashboard.counts}
        actions={
          overdue.length === 0 ? (
            <Badge tone="success">{T.dashboard.noOverdue}</Badge>
          ) : (
            <Badge tone="danger">{T.dashboard.overdueCount(overdue.length)}</Badge>
          )
        }
      >
        <QueueList
          testId="visit-counts"
          label={T.dashboard.counts}
          items={PIPELINE_STATUSES.map((status) => ({
            key: status,
            label: t.office.sessionStatus[status],
            value: counts[status],
            href: opsHref.visits({ durum: status }),
            tone: status === "in_review" || status === "captured" ? "warning" : "info",
          }))}
        />
      </Panel>

      {invitations.length > 0 && (
        <ViewerInvitations
          invitations={invitations}
          today={todayIn(now)}
          kvkkVersions={kvkkVersions}
        />
      )}
      {followups.length > 0 && (
        <ExpertRequests
          followups={followups}
          parcels={new Map(parcels.map((p) => [p.id, p.name]))}
          visits={visits.filter((v) => v.status === "planned")}
        />
      )}

      <Panel plain title={T.dashboard.upcoming(UPCOMING_DAYS)} id="upcoming">
        {upcoming.length === 0 ? (
          <p className="muted">{T.dashboard.noUpcoming}</p>
        ) : (
          <VisitTable visits={upcoming} leads={leads} testId="upcoming-visits" />
        )}
      </Panel>

      <Panel plain title={T.dashboard.parcels} id="parcels">
        {parcels.length === 0 ? (
          <EmptyState
            title={T.dashboard.noParcels}
            action={<ButtonLink href={opsHref.newParcel()}>{T.nav.newParcel}</ButtonLink>}
          />
        ) : (
          <>
            <Table data-testid="parcel-list">
              <thead>
                <tr>
                  <th>{t.parcels.columns.name}</th>
                  <th>{T.parcel.lifecycle}</th>
                  <th>{t.parcels.columns.location}</th>
                  <th className={cell.num}>{t.parcels.columns.area}</th>
                  <th className={cell.num}>{t.parcels.columns.trees}</th>
                </tr>
              </thead>
              <tbody>
                {parcelPage.rows.map((parcel) => (
                  <tr key={parcel.id} data-parcel-id={parcel.id}>
                    <td className={opsCell.nowrap}>
                      <Link href={opsHref.parcel(parcel.id)}>{parcel.name}</Link>
                    </td>
                    <td>
                      <Badge tone={statusTone(parcel.status)}>
                        {t.parcels.status[parcel.status]}
                      </Badge>
                    </td>
                    <td>
                      {[parcel.village, parcel.district, parcel.province]
                        .filter(Boolean)
                        .join(", ")}
                    </td>
                    <td className={cell.num}>
                      {parcel.estimated_area_m2 != null &&
                        `${formatNumber(parcel.estimated_area_m2)} ${t.parcels.areaUnit}`}
                    </td>
                    <td className={cell.num}>
                      {parcel.estimated_tree_count != null &&
                        formatNumber(parcel.estimated_tree_count)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination {...parcelPage} href={(p) => `${opsHref.dashboard()}?sayfa=${p}#parcels`} />
          </>
        )}
      </Panel>
    </main>
  );
}
