import { notFound, redirect } from "next/navigation";
import { issueAddonQuoteAction, issueParcelQuoteAction } from "@/app/operasyon/back-office-actions";
import { ActionForm } from "@/components/back-office/action-form";
import { AddonPreviewNotes } from "@/components/back-office/addon-preview-notes";
import { BoResultNotice, Facts, Warning, day, money } from "@/components/back-office/parts";
import f from "@/components/back-office/quote-form.module.css";
import q from "@/components/back-office/quote.module.css";
import { QuoteLines } from "@/components/back-office/quote-lines";
import { Field } from "@/components/operations/field";
import styles from "@/components/operations/operations.module.css";
import { Panel } from "@/components/ui/panel";
import { Split } from "@/components/ui/layout";
import { Alert } from "@/components/ui/alert";
import { Badge as UiBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Consequence } from "@/components/ui/disclosure";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Table, cell } from "@/components/ui/table";
import { requireSection } from "@/lib/auth/session";
import {
  getOrder,
  getPrices,
  getSetting,
  membershipOrEmpty,
  ownerParcels,
  periodItems,
  previewAddonQuote,
  type OrderView,
} from "@/lib/back-office/data";
import { boHref, firstParam } from "@/lib/back-office/urls";
import {
  addDays,
  bpToPercent,
  parseIsoDate,
  parseNewInventory,
  percentToBp,
} from "@/lib/back-office/validation";
import { BILLING_ERRORS, type BillingError } from "@/lib/billing/errors";
import { formatDonum } from "@/lib/billing/money";
import { t } from "@/lib/i18n";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { billingText } from "@/lib/i18n/messages/billing";
import { getOwnerProfile } from "@/lib/operations/data";
import { opsHref } from "@/lib/operations/urls";
import { todayIn } from "@/lib/operations/visits";
import { isUuid } from "@/lib/supabase/query";
import { createClient } from "@/lib/supabase/server";
import type { Client } from "@/lib/supabase/types";

const B = backOfficeText;
const T = B.quote;
const A = B.addon;
const R = B.renewal;

type Query = Record<string, string | string[] | undefined>;

interface ParcelChoice {
  id: string;
  name: string;
  areaM2: number | null;
  checked: boolean;
  // Why it is left unchecked (an open removal).
  note?: string;
}

const errorText = (error: string) =>
  (BILLING_ERRORS as readonly string[]).includes(error)
    ? billingText.errors[error as BillingError]
    : billingText.errors.write_failed;

const many = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

// A quote for existing parcels: the first order of an owner's parcels
// (?sahip=<profile>, ops_issue_parcel_quote), the renewal of a base order
// (?siparis=<order>) whose service starts the day after the old one ends,
// or an add-on quote joining a base order (?ek=<base order>, IP14 §4.3;
// with &siparis=<order> the gardens of that period move into it: §4.4).
export default async function Page({ searchParams }: { searchParams: Promise<Query> }) {
  await requireSection("operasyon");
  const query = await searchParams;
  const supabase = await createClient();
  const today = todayIn(new Date());
  const addonOf = firstParam(query.ek);
  if (addonOf) return <AddonQuote supabase={supabase} query={query} baseId={addonOf} />;

  let orgId: string;
  let customerUserId: string;
  let customerName: string | null = null;
  let parcels: ParcelChoice[];
  let renewal: { id: string; number: string } | null = null;
  let packageId: string | null = null;
  let start = today;
  let back: string;
  let backLabel: string;
  let other: ParcelChoice[] = [];
  let addedAfterQuote = false;
  let merge: { orderId: string; number: string; end: string } | null = null;

  const orderId = firstParam(query.siparis);
  const profileId = firstParam(query.sahip);
  if (orderId) {
    const view = await getOrder(supabase, orderId);
    if (!view) notFound();
    // An add-on is renewed with its base (IP14 §4.1 step 8).
    if (view.order.addon_of_order_id) {
      redirect(boHref.newQuote({ siparis: view.order.addon_of_order_id }));
    }
    orgId = view.order.org_id;
    customerUserId = view.order.customer_user_id;
    customerName = view.summary?.customer_name ?? null;
    renewal = { id: view.order.id, number: view.order.number };
    if (view.order.service_end) start = addDays(view.order.service_end, 1);
    const { data } = await supabase
      .from("quote")
      .select("package_id")
      .eq("id", view.order.quote_id)
      .maybeSingle();
    packageId = data?.package_id ?? null;
    back = boHref.order(view.order.id);
    backLabel = B.order.title(view.order.number);
    const choices = await renewalChoices(supabase, view);
    parcels = choices.parcels;
    other = choices.other;
    addedAfterQuote = choices.addedAfterQuote;
    merge = choices.merge;
  } else if (profileId) {
    const profile = await getOwnerProfile(supabase, profileId);
    if (!profile) notFound();
    orgId = profile.org_id;
    customerUserId = profile.user_id;
    customerName = profile.full_name;
    parcels = (await ownerParcels(supabase, profile.user_id))
      .filter((p) => p.orgId === orgId)
      .map((p) => ({ ...p, checked: true }));
    back = boHref.customer(profile.id);
    backLabel = B.account.title;
  } else {
    notFound();
  }

  const [prices, setting] = await Promise.all([
    getPrices(supabase, orgId, today),
    getSetting(supabase, orgId),
  ]);
  const packages = prices.packages.filter((p) => p.active);
  const all = [...parcels, ...other];

  return (
    <main className="page">
      <PageHeader
        title={renewal ? T.renewalTitle(renewal.number) : T.newTitle}
        back={{ href: back, label: backLabel }}
        lead={`${T.customer}: ${customerName ?? B.none}`}
      />
      <BoResultNotice params={query} />
      {addedAfterQuote && <Warning testId="renewal-added-after">{R.addedAfterQuote}</Warning>}
      {merge && renewal && (
        <Alert tone="info" testId="renewal-merge">
          <p>{R.mergeHint(merge.number, day(merge.end))}</p>
          <p>
            <ButtonLink
              variant="secondary"
              size="sm"
              href={boHref.newQuote({ ek: merge.orderId, siparis: renewal.id })}
            >
              {R.merge}
            </ButtonLink>
          </p>
        </Alert>
      )}
      {all.length === 0 ? (
        <EmptyState
          title={T.noParcelsTitle}
          action={
            <ButtonLink href={opsHref.newParcel(profileId ?? undefined)}>
              {profileId ? t.operations.owners.addParcel : t.operations.nav.newParcel}
            </ButtonLink>
          }
        >
          <p>{T.noParcels}</p>
        </EmptyState>
      ) : (
        <div className={f.formColumn}>
          <Panel title={T.formTitle}>
            <ActionForm action={issueParcelQuoteAction} testId="parcel-quote-form">
              <input type="hidden" name="org_id" value={orgId} />
              <input type="hidden" name="customer_user_id" value={customerUserId} />
              {renewal && <input type="hidden" name="renewal_of_order_id" value={renewal.id} />}
              <ParcelTable legend={T.parcels} parcels={parcels} />
              {other.length > 0 && <ParcelTable legend={R.otherParcels} parcels={other} />}
              <div className={styles.grid}>
                <Field label={T.package}>
                  <select
                    name="package_id"
                    defaultValue={packageId ?? packages[0]?.id ?? ""}
                    required
                  >
                    {packages.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({B.membership.visits(p.periodic_visits_per_year)})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={T.start} hint={renewal ? T.startHint : undefined}>
                  <input type="date" name="proposed_service_start" defaultValue={start} required />
                </Field>
                <div className={styles.wide}>
                  <Checkbox
                    id="first_year"
                    name="first_year"
                    defaultChecked={!renewal}
                    label={T.firstYear}
                  />
                </div>
                <TermFields validDays={setting?.quote_valid_days ?? 30} />
              </div>
              <IssueFooter label={T.submit} />
            </ActionForm>
          </Panel>
        </div>
      )}
    </main>
  );
}

// The end of an issue form: what happens on issuing, the total when it is
// known (the add-on preview), and the button.
function IssueFooter({ label, total }: { label: string; total?: number }) {
  return (
    <div className={q.issue}>
      {total != null && (
        <p className={q.amount}>
          {T.previewTotal} <strong>{money(total)}</strong>
        </p>
      )}
      <Consequence>{T.issueConsequence}</Consequence>
      <div className={q.actions}>
        <Button type="submit">{label}</Button>
      </div>
    </div>
  );
}

function ParcelTable({ legend, parcels }: { legend: string; parcels: ParcelChoice[] }) {
  const notes = parcels.some((p) => p.note);
  return (
    <fieldset className={f.fieldset}>
      <legend>{legend}</legend>
      <Table>
        <thead>
          <tr>
            <th>{T.parcel}</th>
            <th className={cell.num}>{T.area}</th>
            {notes && <th>{T.parcelNote}</th>}
          </tr>
        </thead>
        <tbody>
          {parcels.map((p) => (
            <tr key={p.id} data-parcel-id={p.id}>
              <td>
                <label className={f.choice}>
                  <input
                    type="checkbox"
                    name="parcel_ids"
                    value={p.id}
                    defaultChecked={p.checked}
                  />
                  {p.name}
                </label>
              </td>
              <td className={cell.num}>
                {p.areaM2 != null ? formatDonum(Number(p.areaM2)) : B.none}
              </td>
              {notes && (
                <td>
                  {p.note && (
                    <UiBadge tone="warning" testId="parcel-open-removal">
                      {p.note}
                    </UiBadge>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </Table>
    </fieldset>
  );
}

// discountBp: the discount of the preview, sent as is (an add-on quote is
// issued with the terms ops previewed).
function TermFields({ validDays, discountBp }: { validDays: number; discountBp?: number }) {
  return (
    <>
      <Field label={B.fields.valid_days} hint={T.validDaysHint(validDays)} optional>
        <input name="valid_days" inputMode="numeric" />
      </Field>
      {discountBp == null ? (
        <Field label={B.fields.discount_percent} hint={T.discountHint} optional>
          <input name="discount_percent" inputMode="decimal" />
        </Field>
      ) : (
        <input
          type="hidden"
          name="discount_percent"
          value={discountBp ? bpToPercent(discountBp) : ""}
        />
      )}
      <Field label={T.discountNote} optional wide>
        <input name="discount_note" maxLength={500} />
      </Field>
      <Field label={T.noteToCustomer} optional wide>
        <textarea name="note_to_customer" maxLength={1000} rows={3} />
      </Field>
    </>
  );
}

// The parcels of a renewal (IP14 §4.1 step 8, §12): those in service or
// starting later in the period (base order and its add-ons; for a period
// already over, the lines of both) checked, those with an open removal
// unchecked and labelled, the customer's other owner parcels unchecked; a
// warning when gardens joined after the open renewal quote; and a later
// period to merge into.
async function renewalChoices(supabase: Client, view: OrderView) {
  const o = view.order;
  const [membership, owned] = await Promise.all([
    membershipOrEmpty(supabase, o.org_id, o.customer_user_id),
    ownerParcels(supabase, o.customer_user_id),
  ]);
  const areas = new Map(owned.map((p) => [p.id, p.areaM2]));
  const ofPeriod = membership.gardens.filter((g) => g.base_order_id === o.id);
  const leaving = (g: (typeof ofPeriod)[number]) =>
    g.state === "leaving" || g.removal_status === "requested" || g.removal_status === "scheduled";
  let parcels: ParcelChoice[] = ofPeriod
    .filter((g) => g.state === "in_service" || g.state === "leaving" || g.state === "upcoming")
    .map((g) => ({
      id: g.parcel_id,
      name: g.garden_name,
      areaM2: areas.get(g.parcel_id) ?? null,
      checked: !leaving(g),
      note: leaving(g) ? R.openRemoval(day(g.removal_effective_on)) : undefined,
    }));
  if (parcels.length === 0) {
    // A period already over: the lines of the old order and of its add-ons,
    // one choice per parcel.
    const items = (await periodItems(supabase, view)).filter((i) => i.parcel_id && !i.removed_on);
    parcels = items
      .filter((i, n) => items.findIndex((x) => x.parcel_id === i.parcel_id) === n)
      .map((i) => ({
        id: i.parcel_id!,
        name: i.parcelName ?? i.garden_name,
        areaM2: areas.get(i.parcel_id!) ?? null,
        checked: !i.openRemoval,
        note: i.openRemoval
          ? R.openRemoval(day(i.openRemoval.effective_on ?? i.openRemoval.requested_effective_on))
          : undefined,
      }));
  }
  const listed = new Set(parcels.map((p) => p.id));
  const other: ParcelChoice[] = owned
    .filter((p) => p.orgId === o.org_id && !listed.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, areaM2: p.areaM2, checked: false }));

  const period = membership.periods.find((p) => p.base_order_id === o.id);
  let addedAfterQuote = false;
  if (period?.renewal_quote_id) {
    const { data } = await supabase
      .from("quote")
      .select("issued_at")
      .eq("id", period.renewal_quote_id)
      .maybeSingle();
    const issuedAt = data?.issued_at;
    addedAfterQuote =
      !!issuedAt &&
      view.addons.some((a) => a.status === "active" && a.activated_at && a.activated_at > issuedAt);
  }
  const later = membership.periods
    .filter((p) => p.base_order_id !== o.id && o.service_end && p.period_end > o.service_end)
    .sort((x, y) => y.period_end.localeCompare(x.period_end))[0];
  return {
    parcels,
    other,
    addedAfterQuote,
    merge: later
      ? { orderId: later.base_order_id, number: later.base_order_number, end: later.period_end }
      : null,
  };
}

// ?ek=<base>: an add-on quote for existing parcels (ops_issue_addon_quote,
// parcel path). The parcels and the start are picked first (a GET form, so
// the preview follows them); the quote is then issued for that selection.
async function AddonQuote({
  supabase,
  query,
  baseId,
}: {
  supabase: Client;
  query: Query;
  baseId: string;
}) {
  const view = await getOrder(supabase, baseId);
  if (!view) notFound();
  const o = view.order;
  const back = boHref.order(o.id);
  const isBase = !o.addon_of_order_id && o.status === "active";
  const fromId = firstParam(query.siparis);
  const from =
    fromId && isUuid(fromId) && fromId !== o.id ? await getOrder(supabase, fromId) : null;
  const [membership, owned, setting] = await Promise.all([
    membershipOrEmpty(supabase, o.org_id, o.customer_user_id),
    ownerParcels(supabase, o.customer_user_id),
    getSetting(supabase, o.org_id),
  ]);
  const parcels = owned.filter((p) => p.orgId === o.org_id);
  const fromParcels = from
    ? membership.gardens
        .filter((g) => g.base_order_id === from.order.id && g.state === "in_service")
        .map((g) => g.parcel_id)
    : [];
  const asked = many(query.parsel).filter((id) => parcels.some((p) => p.id === id));
  const selected = asked.length ? asked : fromParcels;
  const startParam = parseIsoDate(firstParam(query.baslangic) ?? "");
  const start = startParam ?? (from?.order.service_end ? addDays(from.order.service_end, 1) : null);
  const discountBp = percentToBp(firstParam(query.indirim) ?? "") ?? 0;
  // T18: "yeni envanter gerekli" with a reason, per selected parcel.
  const marks = parseNewInventory((name) => firstParam(query[name]) ?? "", selected, "envanter_");
  const newInventory = marks.ok ? marks.value : null;
  const preview =
    isBase && selected.length
      ? await previewAddonQuote(supabase, {
          baseOrderId: o.id,
          parcelIds: selected,
          start,
          discountBp,
          newInventory,
        })
      : null;
  // This order's last add-on day (private.addon_last_day), not the
  // customer-wide add-on base's: in a merge the page's order may be another.
  const addonUntil =
    o.service_end && setting ? addDays(o.service_end, 1 - setting.addon_min_days) : null;

  const previewLines = preview && "lines" in preview ? preview.lines : null;
  const issue = (
    <Panel title={A.submit} description={previewLines ? A.termsFromPreview : undefined}>
      {previewLines ? (
        <ActionForm action={issueAddonQuoteAction} testId="addon-quote-form">
          <input type="hidden" name="base_order_id" value={o.id} />
          {selected.map((id) => (
            <input key={id} type="hidden" name="parcel_ids" value={id} />
          ))}
          {Object.entries(newInventory ?? {}).map(([id, reason]) => (
            <input key={id} type="hidden" name={`new_inventory_${id}`} value={reason} />
          ))}
          {start && <input type="hidden" name="proposed_service_start" value={start} />}
          <TermFields validDays={setting?.quote_valid_days ?? 30} discountBp={discountBp} />
          <IssueFooter
            label={A.submit}
            total={previewLines.reduce((sum, l) => sum + Number(l.line_total_kurus), 0)}
          />
        </ActionForm>
      ) : (
        <p className="muted">{A.issueAfterPick}</p>
      )}
    </Panel>
  );

  return (
    <main className="page">
      <PageHeader
        title={A.newTitle(o.number)}
        back={{ href: back, label: B.order.title(o.number) }}
        lead={`${T.customer}: ${view.summary?.customer_name ?? B.none}`}
      />
      <BoResultNotice params={query} />
      {!isBase ? (
        <Warning testId="addon-not-base">{A.noMembership}</Warning>
      ) : (
        <Split aside={issue}>
          {from && <Warning testId="addon-merge">{A.mergeFrom(from.order.number)}</Warning>}
          <Panel title={A.pickTitle} description={A.hint}>
            <Facts
              rows={[
                [A.period, `${day(o.service_start)} – ${day(o.service_end)}`],
                [A.lastDay, day(addonUntil)],
              ]}
            />
            <form className={styles.form} action="/operasyon/teklif/yeni" data-testid="addon-pick">
              <input type="hidden" name="ek" value={o.id} />
              {from && <input type="hidden" name="siparis" value={from.order.id} />}
              <fieldset className={f.fieldset}>
                <legend>{T.parcels}</legend>
                <Consequence>{A.parcelsHint}</Consequence>
                {parcels.length === 0 && (
                  <EmptyState
                    compact
                    headingLevel={3}
                    title={T.noParcelsTitle}
                    action={
                      <ButtonLink variant="secondary" size="sm" href={opsHref.newParcel()}>
                        {t.operations.nav.newParcel}
                      </ButtonLink>
                    }
                  >
                    <p>{T.noParcels}</p>
                  </EmptyState>
                )}
                {parcels.map((p) => (
                  <label key={p.id} className={f.choice} data-parcel-id={p.id}>
                    <input
                      type="checkbox"
                      name="parsel"
                      value={p.id}
                      defaultChecked={selected.includes(p.id)}
                    />
                    {p.name}
                    {p.areaM2 != null && (
                      <span className="muted">{formatDonum(Number(p.areaM2))}</span>
                    )}
                  </label>
                ))}
              </fieldset>
              {selected.length > 0 && (
                <fieldset className={f.fieldset} data-testid="addon-new-inventory">
                  <legend>{A.newInventory}</legend>
                  <Consequence>{A.newInventoryHint}</Consequence>
                  {parcels
                    .filter((p) => selected.includes(p.id))
                    .map((p) => (
                      <Field key={p.id} label={p.name} optional>
                        <input
                          name={`envanter_${p.id}`}
                          maxLength={300}
                          defaultValue={newInventory?.[p.id] ?? ""}
                        />
                      </Field>
                    ))}
                </fieldset>
              )}
              <div className={q.inlineForm}>
                <Field label={T.start} optional>
                  <input type="date" name="baslangic" defaultValue={start ?? ""} />
                </Field>
                <Field label={B.fields.discount_percent} hint={T.discountHint} optional>
                  <input
                    name="indirim"
                    inputMode="decimal"
                    defaultValue={bpToPercent(discountBp)}
                  />
                </Field>
              </div>
              <div className={q.actions}>
                <Button type="submit" variant="secondary">
                  {A.previewButton}
                </Button>
              </div>
            </form>
          </Panel>
          {preview && "error" in preview && (
            <Warning testId="addon-preview-error">{errorText(preview.error)}</Warning>
          )}
          {previewLines && (
            <Panel title={A.preview}>
              {previewLines[0] && (
                <Facts
                  rows={[
                    [
                      A.service,
                      `${day(previewLines[0].service_start)} – ${day(previewLines[0].service_end)}`,
                    ],
                  ]}
                />
              )}
              <QuoteLines
                testId="addon-preview"
                lines={previewLines}
                vatRateBp={previewLines[0]?.vat_rate_bp ?? 0}
              />
              <AddonPreviewNotes lines={previewLines} />
            </Panel>
          )}
        </Split>
      )}
    </main>
  );
}
