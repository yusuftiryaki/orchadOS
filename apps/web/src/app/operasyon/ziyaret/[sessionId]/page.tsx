import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelVisitAction } from "@/app/operasyon/actions";
import { OpsNav } from "@/components/operations/ops-nav";
import styles from "@/components/operations/operations.module.css";
import { CloseupList } from "@/components/operations/closeup-list";
import { LegalNotice } from "@/components/operations/legal-notice";
import { MediaSuppression } from "@/components/operations/media-suppression";
import { ResultNotice } from "@/components/operations/result-notice";
import { VisitForm } from "@/components/operations/visit-form";
import { requireSection } from "@/lib/auth/session";
import { formatDate, t } from "@/lib/i18n";
import { loadCloseupList } from "@/lib/expert/followups";
import { createMediaSigner } from "@/lib/media/signer";
import { getVisit, listStaffByUser, opsOrgs } from "@/lib/operations/data";
import { listSuppressions, listVisitMedia, type MediaTab } from "@/lib/operations/legal";
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
  const closeups =
    visit.kind === "periodic_scan" && visit.status !== "cancelled"
      ? await loadCloseupList(supabase, visit.id)
      : null;

  // T20: hiding images of a scanned visit (ops only).
  const query = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const tabParam = one(query.gorsel);
  const tab: MediaTab =
    tabParam === "tree_crop" || tabParam === "closeup" ? tabParam : "panorama";
  const pageNo = Math.max(0, Math.min(999, Number.parseInt(one(query.sayfa) ?? "0", 10) || 0));
  const isOps = orgs.some((o) => o.id === visit.org_id);
  const scanned = visit.kind !== "verification" && ["processed", "in_review", "published"].includes(visit.status);
  const mediaHref = (tabName: MediaTab, page: number) =>
    `${opsHref.visit(visit.id)}?gorsel=${tabName}&sayfa=${page}#gorseller`;
  const media =
    isOps && scanned
      ? await (async () => {
          const [records, gallery] = await Promise.all([
            listSuppressions(supabase, { sessionId: visit.id }),
            listVisitMedia(supabase, visit.id, tab, pageNo),
          ]);
          const urls = await createMediaSigner(supabase, { scope: user.id }).signUrls([
            ...records.map((r) => r.uri),
            ...gallery.items.map((i) => i.uri),
          ]);
          return { records, gallery, urls };
        })()
      : null;

  return (
    <main className="page">
      <OpsNav current="visits" />
      <p>
        <Link href={opsHref.visits()}>← {T.visits.title}</Link>
      </p>
      <h1>
        {T.visitKind[visit.kind as VisitKind]} · {visit.parcel_name}
      </h1>
      <ResultNotice params={query} />
      <LegalNotice params={query} />
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
      {closeups && <CloseupList items={closeups} />}
      {media && (
        <div id="gorseller">
          <MediaSuppression
            back={mediaHref(tab, pageNo)}
            records={media.records}
            urls={media.urls}
            gallery={{
              tab,
              page: pageNo,
              more: media.gallery.more,
              items: media.gallery.items,
              href: mediaHref,
            }}
          />
        </div>
      )}
    </main>
  );
}
