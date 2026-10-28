import { FilterTabs, Pagination, Toolbar, pageOf } from "@/components/operations/ops-ui";
import { VisitTable } from "@/components/operations/visit-table";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { requireSection } from "@/lib/auth/session";
import { t } from "@/lib/i18n";
import { listFieldStaff, listParcelOptions, listVisits, opsOrgs } from "@/lib/operations/data";
import { opsHref } from "@/lib/operations/urls";
import { isVisitKind, type SessionStatus } from "@/lib/operations/visits";
import { Constants } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import styles from "./visits.module.css";

const T = t.operations;
const STATUSES = Constants.public.Enums.session_status as readonly SessionStatus[];

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

// Visit list: status tabs with counts (?durum), and parcel, lead, kind and a
// planned-day range as a compact filter form (?parsel, ?personel, ?tur,
// ?baslangic, ?bitis). Newest planned day first.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("operasyon");
  const params = await searchParams;
  const parcelId = first(params.parsel);
  const leadUserId = first(params.personel);
  const rawStatus = first(params.durum);
  const status = (STATUSES as readonly string[]).includes(rawStatus)
    ? (rawStatus as SessionStatus)
    : null;
  const kind = first(params.tur);
  const from = isDay(first(params.baslangic)) ? first(params.baslangic) : "";
  const to = isDay(first(params.bitis)) ? first(params.bitis) : "";

  const supabase = await createClient();
  const orgsP = opsOrgs(supabase, user.id);
  // All statuses at once: the tabs count them, the table shows the chosen one.
  const [all, parcels, staff] = await Promise.all([
    listVisits(supabase, {
      parcelId,
      leadUserId,
      kind: isVisitKind(kind) ? kind : null,
    }),
    listParcelOptions(supabase),
    orgsP.then((orgs) => listFieldStaff(supabase, orgs)),
  ]);
  const leads = new Map(staff.map((s) => [s.userId, s.email]));

  const inRange = all.filter(
    (v) =>
      (!from || (v.planned_date != null && v.planned_date >= from)) &&
      (!to || (v.planned_date != null && v.planned_date <= to)),
  );
  const counts = new Map<string, number>();
  for (const v of inRange) counts.set(v.status, (counts.get(v.status) ?? 0) + 1);
  const visits = status ? inRange.filter((v) => v.status === status) : inRange;
  const page = pageOf(visits, params.sayfa);

  const filters = {
    parsel: parcelId,
    personel: leadUserId,
    tur: isVisitKind(kind) ? kind : "",
    baslangic: from,
    bitis: to,
  };
  const filtered = Object.values(filters).some(Boolean);
  const href = (extra: Record<string, string | null>) => opsHref.visits({ ...filters, ...extra });

  return (
    <main className="page">
      <PageHeader
        title={T.visits.title}
        actions={<ButtonLink href={opsHref.newVisit()}>{T.nav.newVisit}</ButtonLink>}
      />

      <form className={styles.filters} method="get" aria-label={T.visits.filters}>
        {status && <input type="hidden" name="durum" value={status} />}
        <Field id="f-parsel" label={T.visits.parcel}>
          <Select name="parsel" defaultValue={parcelId}>
            <option value="">{T.visits.allParcels}</option>
            {parcels.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="f-personel" label={T.columns.lead}>
          <Select name="personel" defaultValue={leadUserId}>
            <option value="">{T.visits.allStaff}</option>
            {[...leads].map(([id, email]) => (
              <option key={id} value={id}>
                {email}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="f-tur" label={T.columns.kind}>
          <Select name="tur" defaultValue={kind}>
            <option value="">{T.visits.allKinds}</option>
            {Object.entries(T.visitKind).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="f-baslangic" label={T.visits.from}>
          <Input type="date" name="baslangic" defaultValue={from} />
        </Field>
        <Field id="f-bitis" label={T.visits.to}>
          <Input type="date" name="bitis" defaultValue={to} />
        </Field>
        <div className={styles.filterActions}>
          <Button variant="secondary" type="submit">
            {T.visits.apply}
          </Button>
          {filtered && (
            <ButtonLink variant="quiet" href={opsHref.visits({ durum: status })}>
              {T.visits.clearFilters}
            </ButtonLink>
          )}
        </div>
      </form>

      <div>
        <Toolbar end={T.visits.count(visits.length)}>
          <FilterTabs
            label={T.visits.statusFilter}
            testId="visit-status-filter"
            items={[
              {
                href: href({}),
                label: T.visits.allStatuses,
                count: inRange.length,
                current: !status,
              },
              ...STATUSES.map((s) => ({
                href: href({ durum: s }),
                label: t.office.sessionStatus[s],
                count: counts.get(s) ?? 0,
                current: status === s,
              })),
            ]}
          />
        </Toolbar>
        {visits.length === 0 ? (
          all.length === 0 && !filtered ? (
            <EmptyState
              title={T.visits.none}
              action={<ButtonLink href={opsHref.newVisit()}>{T.nav.newVisit}</ButtonLink>}
            >
              <p>{T.visits.noneHint}</p>
            </EmptyState>
          ) : status && !filtered ? (
            <EmptyState
              title={T.visits.emptyStatus(t.office.sessionStatus[status])}
              action={
                status === "planned" ? (
                  <ButtonLink href={opsHref.newVisit()}>{T.nav.newVisit}</ButtonLink>
                ) : (
                  <ButtonLink variant="secondary" href={opsHref.visits()}>
                    {T.visits.showAll}
                  </ButtonLink>
                )
              }
            >
              {status === "planned" && <p>{T.visits.emptyPlanned}</p>}
            </EmptyState>
          ) : (
            <EmptyState
              title={T.visits.empty}
              action={
                <ButtonLink variant="secondary" href={opsHref.visits({ durum: status })}>
                  {T.visits.clearFilters}
                </ButtonLink>
              }
            >
              <p>{T.visits.emptyHint}</p>
            </EmptyState>
          )
        ) : (
          <>
            <VisitTable visits={page.rows} leads={leads} testId="visit-list" />
            <Pagination {...page} href={(p) => href({ durum: status, sayfa: String(p) })} />
          </>
        )}
      </div>
    </main>
  );
}
