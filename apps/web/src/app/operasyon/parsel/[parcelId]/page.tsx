import Link from "next/link";
import { notFound } from "next/navigation";
import {
  grantAccessAction,
  revokeAccessAction,
  setParcelPassiveAction,
} from "@/app/operasyon/actions";
import { OpsNav } from "@/components/operations/ops-nav";
import styles from "@/components/operations/operations.module.css";
import { ResultNotice } from "@/components/operations/result-notice";
import { VisitTable } from "@/components/operations/visit-table";
import { ParcelDetail } from "@/components/parcel-detail";
import { requireSection } from "@/lib/auth/session";
import { formatDate, formatNumber, t } from "@/lib/i18n";
import {
  getParcelOps,
  listFieldStaff,
  listOwnerProfiles,
  listVisits,
  opsOrgs,
} from "@/lib/operations/data";
import { m2ToDonum } from "@/lib/operations/geometry";
import { opsHref } from "@/lib/operations/urls";
import { createClient } from "@/lib/supabase/server";

const T = t.operations;

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ parcelId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("operasyon");
  const { parcelId } = await params;
  const supabase = await createClient();
  const ops = await getParcelOps(supabase, parcelId);
  if (!ops) notFound();
  const { parcel, detail, access, boundary } = ops;

  const [orgs, profiles, visits] = await Promise.all([
    opsOrgs(supabase, user.id),
    listOwnerProfiles(supabase),
    listVisits(supabase, { parcelId }),
  ]);
  const staff = await listFieldStaff(supabase, orgs);
  const leads = new Map(staff.map((s) => [s.userId, s.email]));
  const withAccess = new Set(access.map((a) => a.user_id));
  const candidates = profiles.filter(
    (p) => p.org_id === parcel.org_id && !withAccess.has(p.user_id),
  );

  const yesNo = (v: boolean | null) => (v == null ? T.unknown : v ? T.yes : T.no);

  const actions = (
    <>
      <OpsNav current={null} />
      <ResultNotice params={await searchParams} />
      <div className={styles.actions}>
        <Link className="button" href={opsHref.newVisit(parcel.id)}>
          {T.visits.planForParcel}
        </Link>
        <Link className="button button-secondary" href={opsHref.boundary(parcel.id)}>
          {boundary ? T.parcel.redrawBoundary : T.parcel.drawBoundary}
        </Link>
        <Link className="button button-secondary" href={opsHref.editParcel(parcel.id)}>
          {T.parcel.edit}
        </Link>
      </div>
      <p />
      <div className={styles.columns}>
        <section className={styles.section} data-testid="parcel-info">
          <h2>{T.parcel.publicSection}</h2>
          <dl className={styles.dl}>
            <dt>{T.parcel.lifecycle}</dt>
            <dd data-testid="parcel-status">{t.parcels.status[parcel.status]}</dd>
            <dt>{t.parcels.columns.location}</dt>
            <dd>
              {[parcel.village, parcel.district, parcel.province].filter(Boolean).join(", ") || "—"}
            </dd>
            <dt>{t.parcels.columns.area}</dt>
            <dd>
              {parcel.estimated_area_m2 != null
                ? `${formatNumber(parcel.estimated_area_m2)} m² (${formatNumber(m2ToDonum(parcel.estimated_area_m2), 1)} dönüm)`
                : "—"}
            </dd>
            <dt>{T.parcel.irrigation}</dt>
            <dd>{T.irrigation[parcel.irrigation]}</dd>
            <dt>{t.parcels.columns.trees}</dt>
            <dd>
              {parcel.estimated_tree_count != null
                ? formatNumber(parcel.estimated_tree_count)
                : "—"}
            </dd>
            <dt>{T.parcel.position}</dt>
            <dd>
              {parcel.position
                ? `${parcel.position[1].toFixed(5)}, ${parcel.position[0].toFixed(5)} (±${formatNumber(parcel.position_uncertainty_m ?? 0)} m)`
                : "—"}
            </dd>
            <dt>{T.parcel.boundary}</dt>
            <dd data-testid="parcel-boundary">
              {boundary
                ? T.parcel.boundaryVersion(
                    boundary.version,
                    T.parcel.boundarySource[
                      boundary.source as keyof typeof T.parcel.boundarySource
                    ] ?? boundary.source,
                  )
                : T.parcel.noBoundary}
            </dd>
          </dl>
          {boundary && <p className={styles.boundaryNote}>{T.parcel.boundaryNote}</p>}
          <form action={setParcelPassiveAction} data-testid="parcel-lifecycle">
            <input type="hidden" name="parcel_id" value={parcel.id} />
            <input type="hidden" name="passive" value={parcel.status === "passive" ? "0" : "1"} />
            <button className="button button-secondary" type="submit">
              {parcel.status === "passive" ? T.parcel.resume : T.parcel.setPassive}
            </button>
            <p className="muted">{T.parcel.passiveHint}</p>
          </form>
        </section>

        <section className={styles.section} data-testid="parcel-private">
          <h2>{T.parcel.privateTitle}</h2>
          {!detail ? (
            <p className="muted">{T.parcel.noDetail}</p>
          ) : (
            <dl className={styles.dl}>
              <dt>
                {T.parcel.deedBlock} / {T.parcel.deedParcel}
              </dt>
              <dd>{[detail.deed_block, detail.deed_parcel].filter(Boolean).join(" / ") || "—"}</dd>
              <dt>{T.parcel.sharedDeed}</dt>
              <dd>{yesNo(detail.is_shared_deed)}</dd>
              <dt>{T.parcel.usedPortion}</dt>
              <dd>{detail.used_portion_note ?? "—"}</dd>
              <dt>{T.parcel.authorizationBasis}</dt>
              <dd>
                {detail.authorization_basis
                  ? T.authorizationBasis[
                      detail.authorization_basis as keyof typeof T.authorizationBasis
                    ]
                  : "—"}
              </dd>
              <dt>{T.parcel.entryPermissionAt}</dt>
              <dd>{detail.entry_permission_at ? formatDate(detail.entry_permission_at) : "—"}</dd>
              <dt>{T.parcel.accessNote}</dt>
              <dd>{detail.access_note ?? "—"}</dd>
              <dt>{T.parcel.siteContactName}</dt>
              <dd>
                {[detail.site_contact_name, detail.site_contact_phone]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </dd>
            </dl>
          )}
        </section>
      </div>

      <section className={styles.section} id="erisim" data-testid="parcel-access">
        <h2>{T.access.title}</h2>
        {access.length === 0 ? (
          <p className="muted">{T.access.empty}</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{T.columns.name}</th>
                <th>{T.columns.account}</th>
                <th>{T.columns.role}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {access.map((a) => (
                <tr key={a.id} data-access-role={a.role}>
                  <td>
                    {a.profile_id ? (
                      <Link href={opsHref.owner(a.profile_id)}>{a.full_name}</Link>
                    ) : (
                      <span className="muted">{T.access.noProfile}</span>
                    )}
                  </td>
                  <td>{a.email ?? "—"}</td>
                  <td>{T.parcelRole[a.role]}</td>
                  <td>
                    <form action={revokeAccessAction}>
                      <input type="hidden" name="parcel_id" value={parcel.id} />
                      <input type="hidden" name="access_id" value={a.id} />
                      <button className="button button-secondary" type="submit">
                        {T.access.revoke}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <form action={grantAccessAction} className={styles.inline} data-testid="grant-access">
          <input type="hidden" name="parcel_id" value={parcel.id} />
          <label>
            {T.access.person}
            <select name="profile_id" defaultValue="">
              <option value="">{T.access.choosePerson}</option>
              {candidates.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {T.access.orEmail}
            <input name="email" type="email" autoComplete="off" />
          </label>
          <label>
            {T.access.role}
            <select
              name="role"
              defaultValue={access.some((a) => a.role === "owner") ? "viewer" : "owner"}
            >
              <option value="owner">{T.parcelRole.owner}</option>
              <option value="viewer">{T.parcelRole.viewer}</option>
            </select>
          </label>
          <button className="button" type="submit">
            {T.access.grant}
          </button>
        </form>
        <p className="muted">{T.access.emailHint}</p>
      </section>

      <section className={styles.section} data-testid="parcel-visits">
        <h2>{T.visits.parcelVisits}</h2>
        {visits.length === 0 ? (
          <p className="muted">{T.visits.noVisits}</p>
        ) : (
          <VisitTable visits={visits} leads={leads} showParcel={false} />
        )}
      </section>
    </>
  );

  return <ParcelDetail section="operasyon" parcelId={parcelId} actions={actions} />;
}
