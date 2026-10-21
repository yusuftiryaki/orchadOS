import { OpsNav } from "@/components/operations/ops-nav";
import styles from "@/components/operations/operations.module.css";
import { VisitTable } from "@/components/operations/visit-table";
import { requireSection } from "@/lib/auth/session";
import { t } from "@/lib/i18n";
import { listFieldStaff, listParcelOptions, listVisits, opsOrgs } from "@/lib/operations/data";
import { isVisitKind, type SessionStatus } from "@/lib/operations/visits";
import { Constants } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";

const T = t.operations;
const STATUSES = Constants.public.Enums.session_status as readonly SessionStatus[];

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

// Visit list, filtered by parcel, lead, status and kind (?parsel, ?personel,
// ?durum, ?tur). Newest planned day first.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("operasyon");
  const params = await searchParams;
  const parcelId = first(params.parsel);
  const leadUserId = first(params.personel);
  const status = first(params.durum);
  const kind = first(params.tur);

  const supabase = await createClient();
  const orgs = await opsOrgs(supabase, user.id);
  const [visits, parcels, staff] = await Promise.all([
    listVisits(supabase, {
      parcelId,
      leadUserId,
      status: (STATUSES as readonly string[]).includes(status) ? (status as SessionStatus) : null,
      kind: isVisitKind(kind) ? kind : null,
    }),
    listParcelOptions(supabase),
    listFieldStaff(supabase, orgs),
  ]);
  const leads = new Map(staff.map((s) => [s.userId, s.email]));

  return (
    <main className="page">
      <OpsNav current="visits" />
      <h1>{T.visits.title}</h1>
      <form className={styles.inline} method="get" aria-label={T.visits.filters}>
        <label>
          {T.visits.parcel}
          <select name="parsel" defaultValue={parcelId}>
            <option value="">{T.visits.allParcels}</option>
            {parcels.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {T.visits.lead}
          <select name="personel" defaultValue={leadUserId}>
            <option value="">{T.visits.allStaff}</option>
            {[...leads].map(([id, email]) => (
              <option key={id} value={id}>
                {email}
              </option>
            ))}
          </select>
        </label>
        <label>
          {T.columns.status}
          <select name="durum" defaultValue={status}>
            <option value="">{T.visits.allStatuses}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t.office.sessionStatus[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {T.columns.kind}
          <select name="tur" defaultValue={kind}>
            <option value="">{T.visits.allKinds}</option>
            {Object.entries(T.visitKind).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button className="button button-secondary" type="submit">
          {T.visits.apply}
        </button>
      </form>
      <p />
      {visits.length === 0 ? (
        <p className="muted">{T.visits.empty}</p>
      ) : (
        <VisitTable visits={visits} leads={leads} testId="visit-list" />
      )}
    </main>
  );
}
