import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelVisitAction } from "@/app/operasyon/actions";
import { statusTone } from "@/components/ui/status";
import { CloseupList } from "@/components/operations/closeup-list";
import { LegalNotice } from "@/components/operations/legal-notice";
import { MediaSuppression } from "@/components/operations/media-suppression";
import { Facts } from "@/components/ui/facts";
import { Panel } from "@/components/ui/panel";
import { Split, Stack } from "@/components/ui/layout";
import { ResultNotice } from "@/components/operations/result-notice";
import { VisitForm } from "@/components/operations/visit-form";
import { VisitRecords } from "@/components/operations/visit-records";
import styles from "@/components/operations/operations.module.css";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireSection } from "@/lib/auth/session";
import { formatDate, t } from "@/lib/i18n";
import { loadCloseupList } from "@/lib/expert/followups";
import { createMediaSigner } from "@/lib/media/signer";
import { getVisit, listStaffByUser, opsOrgs } from "@/lib/operations/data";
import { listSuppressions, listVisitMedia, type MediaTab } from "@/lib/operations/legal";
import { opsHref } from "@/lib/operations/urls";
import { loadVisitRecords } from "@/lib/operations/visit-records";
import { isPlanEditable, todayIn, visitSeason, type VisitKind } from "@/lib/operations/visits";
import { createClient } from "@/lib/supabase/server";

const T = t.operations;

// One visit: its facts and legal records (T07) on the left, changing the plan
// on the right; the close-up list and hiding images (T20) below.
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("operasyon");
  const [{ sessionId }, query] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const [visit, orgs] = await Promise.all([
    getVisit(supabase, sessionId),
    opsOrgs(supabase, user.id),
  ]);
  if (!visit) notFound();
  const season = visitSeason(visit.kind, visit.planned_date, visit.methodology_version);
  const isOps = orgs.some((o) => o.id === visit.org_id);
  const editable = isPlanEditable(visit.status) && isOps;

  // T20: hiding images of a scanned visit (ops only).
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const tabParam = one(query.gorsel);
  const tab: MediaTab = tabParam === "tree_crop" || tabParam === "closeup" ? tabParam : "panorama";
  const pageNo = Math.max(0, Math.min(999, Number.parseInt(one(query.sayfa) ?? "0", 10) || 0));
  const scanned =
    visit.kind !== "verification" && ["processed", "in_review", "published"].includes(visit.status);
  const mediaHref = (tabName: MediaTab, page: number) =>
    `${opsHref.visit(visit.id)}?gorsel=${tabName}&sayfa=${page}#gorseller`;

  const [staff, closeups, legal, media] = await Promise.all([
    listStaffByUser(supabase, orgs),
    visit.kind === "periodic_scan" && visit.status !== "cancelled"
      ? loadCloseupList(supabase, visit.id)
      : null,
    // T07: notices, postponement, missed visits and field notices (ops only).
    isOps && (visit.kind === "inventory" || visit.kind === "periodic_scan")
      ? loadVisitRecords(supabase, visit.id)
      : null,
    isOps && scanned
      ? (async () => {
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
      : null,
  ]);
  const lead = staff.find((s) => s.userId === visit.lead_user_id);
  const kindLabel = T.visitKind[visit.kind as VisitKind] ?? visit.kind;
  const statusBadge = (testId?: string) => (
    <Badge tone={statusTone(visit.status)} testId={testId}>
      {t.office.sessionStatus[visit.status]}
    </Badge>
  );

  const editPanel = (
    <Panel title={T.visits.editTitle}>
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
          methodologyVersion: visit.methodology_version,
        }}
      />
      <form action={cancelVisitAction} className={styles.dangerZone} data-testid="visit-cancel">
        <input type="hidden" name="visit_id" value={visit.id} />
        <p className="muted">{T.visits.cancelHint}</p>
        <Button variant="danger" type="submit">
          {T.visits.cancelVisit}
        </Button>
      </form>
    </Panel>
  );
  // A scanned or cancelled visit has no plan to change: the record takes the
  // full width and says so.
  const record = (
    <>
      <Panel title={T.visits.detailTitle} testId="visit-detail">
        <Facts
          rows={[
            [
              T.columns.parcel,
              <Link key="p" href={opsHref.parcel(visit.parcel_id)}>
                {visit.parcel_name}
              </Link>,
            ],
            [T.columns.kind, kindLabel],
            [T.columns.date, visit.planned_date ? formatDate(visit.planned_date) : "—"],
            [
              T.columns.season,
              <span key="s" data-testid="visit-detail-season">
                {season ? T.season[season] : T.noSeason}
              </span>,
            ],
            [T.columns.lead, visit.lead_user_id ? (lead?.email ?? "—") : T.noLead],
            [T.columns.status, statusBadge("visit-status")],
            [T.columns.notes, visit.notes ?? "—"],
            ...(visit.methodology_version
              ? ([[T.visits.methodology, visit.methodology_version]] as [string, string][])
              : []),
          ]}
        />
        {!editable && (
          <p className="muted" data-testid="visit-locked">
            {T.visits.locked}
          </p>
        )}
      </Panel>
      {legal && (
        <VisitRecords
          visit={{
            id: visit.id,
            status: visit.status,
            kind: visit.kind,
            plannedDate: visit.planned_date,
          }}
          records={legal.records}
          blocked={legal.blocked}
          fieldNotices={legal.fieldNotices}
          today={todayIn(new Date())}
        />
      )}
      {closeups && <CloseupList items={closeups} />}
    </>
  );

  return (
    <main className="page">
      <PageHeader
        title={T.visits.detailHeading(
          kindLabel,
          visit.planned_date ? formatDate(visit.planned_date) : null,
        )}
        back={{ href: opsHref.visits(), label: T.visits.title }}
        lead={<Link href={opsHref.parcel(visit.parcel_id)}>{visit.parcel_name}</Link>}
        meta={statusBadge()}
      />
      <ResultNotice params={query} />
      <LegalNotice params={query} />

      {editable ? <Split aside={editPanel}>{record}</Split> : <Stack>{record}</Stack>}

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
