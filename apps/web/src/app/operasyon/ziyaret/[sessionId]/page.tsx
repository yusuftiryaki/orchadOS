import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelVisitAction } from "@/app/operasyon/actions";
import { OpsNav } from "@/components/operations/ops-nav";
import styles from "@/components/operations/operations.module.css";
import { ResultNotice } from "@/components/operations/result-notice";
import { VisitForm } from "@/components/operations/visit-form";
import { requireSection } from "@/lib/auth/session";
import { formatDate, t } from "@/lib/i18n";
import { getVisit, listStaffByUser, opsOrgs } from "@/lib/operations/data";
import { opsHref } from "@/lib/operations/urls";
import { isPlanEditable, todayIn, visitSeason, type VisitKind } from "@/lib/operations/visits";
import { createClient } from "@/lib/supabase/server";

const T = t.operations;

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("operasyon");
  const { sessionId } = await params;
  const supabase = await createClient();
  const visit = await getVisit(supabase, sessionId);
  if (!visit) notFound();
  const orgs = await opsOrgs(supabase, user.id);
  const staff = await listStaffByUser(supabase, orgs);
  const lead = staff.find((s) => s.userId === visit.lead_user_id);
  const season = visitSeason(visit.kind, visit.planned_date);
  const editable = isPlanEditable(visit.status) && orgs.some((o) => o.id === visit.org_id);

  return (
    <main className="page">
      <OpsNav current="visits" />
      <p>
        <Link href={opsHref.visits()}>← {T.visits.title}</Link>
      </p>
      <h1>
        {T.visitKind[visit.kind as VisitKind]} · {visit.parcel_name}
      </h1>
      <ResultNotice params={await searchParams} />
      <div className={styles.columns}>
        <section className={styles.section} data-testid="visit-detail">
          <h2>{T.visits.detailTitle}</h2>
          <dl className={styles.dl}>
            <dt>{T.columns.parcel}</dt>
            <dd>
              <Link href={opsHref.parcel(visit.parcel_id)}>{visit.parcel_name}</Link>
            </dd>
            <dt>{T.columns.kind}</dt>
            <dd>{T.visitKind[visit.kind as VisitKind]}</dd>
            <dt>{T.columns.date}</dt>
            <dd>{visit.planned_date ? formatDate(visit.planned_date) : "—"}</dd>
            <dt>{T.columns.season}</dt>
            <dd data-testid="visit-detail-season">{season ? T.season[season] : T.noSeason}</dd>
            <dt>{T.columns.lead}</dt>
            <dd>{visit.lead_user_id ? (lead?.email ?? "—") : T.noLead}</dd>
            <dt>{T.columns.status}</dt>
            <dd data-testid="visit-status">{t.office.sessionStatus[visit.status]}</dd>
            <dt>{T.columns.notes}</dt>
            <dd>{visit.notes ?? "—"}</dd>
            {visit.methodology_version && (
              <>
                <dt>{T.visits.methodology}</dt>
                <dd>{visit.methodology_version}</dd>
              </>
            )}
          </dl>
        </section>
        <section className={styles.section}>
          <h2>{T.visits.editTitle}</h2>
          {editable ? (
            <>
              <VisitForm
                parcels={[]}
                staff={staff}
                today={todayIn(new Date())}
                visit={{
                  id: visit.id,
                  parcelId: visit.parcel_id,
                  orgId: visit.org_id,
                  kind: visit.kind as VisitKind,
                  plannedDate: visit.planned_date ?? "",
                  leadUserId: visit.lead_user_id,
                  notes: visit.notes,
                }}
              />
              <form action={cancelVisitAction} className={styles.actions}>
                <input type="hidden" name="visit_id" value={visit.id} />
                <p />
                <button className="button button-secondary" type="submit">
                  {T.visits.cancelVisit}
                </button>
              </form>
            </>
          ) : (
            <p className="muted" data-testid="visit-locked">
              {T.visits.locked}
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
