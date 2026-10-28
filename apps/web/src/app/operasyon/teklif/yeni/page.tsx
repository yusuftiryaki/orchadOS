import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { issueAddonQuoteAction, issueParcelQuoteAction } from "@/app/operasyon/back-office-actions";
import { ActionForm } from "@/components/back-office/action-form";
import { BoResultNotice, Facts, Submit, Warning, day } from "@/components/back-office/parts";
import { QuoteLines } from "@/components/back-office/quote-lines";
import { Field } from "@/components/operations/field";
import { OpsNav } from "@/components/operations/ops-nav";
import styles from "@/components/operations/operations.module.css";
import { requireSection } from "@/lib/auth/session";
import {
  getOrder,
  getPrices,
  getSetting,
  membershipOrEmpty,
  ownerParcels,
  previewAddonQuote,
  type OrderView,
} from "@/lib/back-office/data";
import { boHref, firstParam } from "@/lib/back-office/urls";
import { addDays, parseIsoDate } from "@/lib/back-office/validation";
import { BILLING_ERRORS, type BillingError } from "@/lib/billing/errors";
import { formatDonum } from "@/lib/billing/money";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { billingText } from "@/lib/i18n/messages/billing";
import { getOwnerProfile } from "@/lib/operations/data";
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
      <OpsNav current={renewal ? "orders" : "owners"} />
      <p>
        <Link href={back}>← {B.back}</Link>
      </p>
      <h1>{renewal ? T.renewalTitle(renewal.number) : T.newTitle}</h1>
      <BoResultNotice params={query} />
      <p>
        {T.customer}: <strong>{customerName ?? B.none}</strong>
      </p>
      {addedAfterQuote && <Warning testId="renewal-added-after">{R.addedAfterQuote}</Warning>}
      {merge && renewal && (
        <section className={styles.section} data-testid="renewal-merge">
          <p>{R.mergeHint(merge.number, day(merge.end))}</p>
          <Link
            className="button button-secondary"
            href={boHref.newQuote({ ek: merge.orderId, siparis: renewal.id })}
          >
            {R.merge}
          </Link>
        </section>
      )}
      {all.length === 0 ? (
        <p className="muted">{T.noParcels}</p>
      ) : (
        <ActionForm action={issueParcelQuoteAction} testId="parcel-quote-form">
          <input type="hidden" name="org_id" value={orgId} />
          <input type="hidden" name="customer_user_id" value={customerUserId} />
          {renewal && <input type="hidden" name="renewal_of_order_id" value={renewal.id} />}
          <ParcelBoxes legend={T.parcels} parcels={parcels} />
          {other.length > 0 && <ParcelBoxes legend={R.otherParcels} parcels={other} />}
          <Field label={T.package}>
            <select name="package_id" defaultValue={packageId ?? packages[0]?.id ?? ""} required>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.periodic_visits_per_year})
                </option>
              ))}
            </select>
          </Field>
          <label className={styles.check}>
            <input type="checkbox" name="first_year" defaultChecked={!renewal} />
            {T.firstYear}
          </label>
          <Field label={T.start} hint={T.startHint}>
            <input type="date" name="proposed_service_start" defaultValue={start} required />
          </Field>
          <TermFields validDays={setting?.quote_valid_days ?? 30} />
          <div className={styles.actions}>
            <Submit>{T.submit}</Submit>
          </div>
        </ActionForm>
      )}
    </main>
  );
}

function ParcelBoxes({ legend, parcels }: { legend: string; parcels: ParcelChoice[] }) {
  return (
    <fieldset className={styles.fieldset}>
      <legend>{legend}</legend>
      {parcels.map((p) => (
        <label key={p.id} className={styles.check} data-parcel-id={p.id}>
          <input type="checkbox" name="parcel_ids" value={p.id} defaultChecked={p.checked} />
          {p.name}
          {p.areaM2 != null && <span className="muted"> · {formatDonum(Number(p.areaM2))}</span>}
          {p.note && (
            <span className={styles.badgeLate} data-testid="parcel-open-removal">
              {" "}
              {p.note}
            </span>
          )}
        </label>
      ))}
    </fieldset>
  );
}

function TermFields({ validDays }: { validDays: number }) {
  return (
    <>
      <Field label={B.fields.valid_days} hint={T.validDaysHint(validDays)} optional>
        <input name="valid_days" inputMode="numeric" />
      </Field>
      <Field label={B.fields.discount_percent} hint={T.discountHint} optional>
        <input name="discount_percent" inputMode="decimal" />
      </Field>
      <Field label={T.discountNote} optional>
        <input name="discount_note" maxLength={500} />
      </Field>
      <Field label={T.noteToCustomer} optional>
        <textarea name="note_to_customer" maxLength={1000} rows={3} />
      </Field>
    </>
  );
}

// The parcels of a renewal (IP14 §4.1 step 8, §12): those in service in the
// period (base order and its add-ons) checked, those with an open removal
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
    .filter((g) => g.state === "in_service" || g.state === "leaving")
    .map((g) => ({
      id: g.parcel_id,
      name: g.garden_name,
      areaM2: areas.get(g.parcel_id) ?? null,
      checked: !leaving(g),
      note: leaving(g) ? R.openRemoval(day(g.removal_effective_on)) : undefined,
    }));
  if (parcels.length === 0) {
    // A period already over: the old order's lines, as before IP14.
    parcels = view.items
      .filter((i) => i.parcel_id && !i.removed_on)
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
  const period = membership.periods.find((p) => p.base_order_id === o.id);
  const fromParcels = from
    ? membership.gardens
        .filter((g) => g.base_order_id === from.order.id && g.state === "in_service")
        .map((g) => g.parcel_id)
    : [];
  const asked = many(query.parsel).filter((id) => parcels.some((p) => p.id === id));
  const selected = asked.length ? asked : fromParcels;
  const startParam = parseIsoDate(firstParam(query.baslangic) ?? "");
  const start = startParam ?? (from?.order.service_end ? addDays(from.order.service_end, 1) : null);
  const preview =
    isBase && selected.length
      ? await previewAddonQuote(supabase, { baseOrderId: o.id, parcelIds: selected, start })
      : null;
  const addonUntil = period?.addon_base_order_id ? period.addon_until : null;

  return (
    <main className="page">
      <OpsNav current="orders" />
      <p>
        <Link href={back}>← {B.back}</Link>
      </p>
      <h1>{A.newTitle(o.number)}</h1>
      <BoResultNotice params={query} />
      <p>
        {T.customer}: <strong>{view.summary?.customer_name ?? B.none}</strong>
      </p>
      {!isBase ? (
        <p className="muted" data-testid="addon-not-base">
          {A.noMembership}
        </p>
      ) : (
        <>
          <p className="muted">{A.hint}</p>
          {from && <Warning testId="addon-merge">{A.mergeFrom(from.order.number)}</Warning>}
          <Facts
            rows={[
              [A.period, `${day(o.service_start)} – ${day(o.service_end)}`],
              [A.lastDay, day(addonUntil)],
            ]}
          />
          <form className={styles.form} action="/operasyon/teklif/yeni" data-testid="addon-pick">
            <input type="hidden" name="ek" value={o.id} />
            {from && <input type="hidden" name="siparis" value={from.order.id} />}
            <fieldset className={styles.fieldset}>
              <legend>{T.parcels}</legend>
              <p className={styles.hint}>{A.parcelsHint}</p>
              {parcels.length === 0 && <p className="muted">{T.noParcels}</p>}
              {parcels.map((p) => (
                <label key={p.id} className={styles.check} data-parcel-id={p.id}>
                  <input
                    type="checkbox"
                    name="parsel"
                    value={p.id}
                    defaultChecked={selected.includes(p.id)}
                  />
                  {p.name}
                  {p.areaM2 != null && (
                    <span className="muted"> · {formatDonum(Number(p.areaM2))}</span>
                  )}
                </label>
              ))}
            </fieldset>
            <Field label={T.start} optional>
              <input type="date" name="baslangic" defaultValue={start ?? ""} />
            </Field>
            <div className={styles.actions}>
              <button className="button button-secondary" type="submit">
                {A.previewButton}
              </button>
            </div>
          </form>
          {preview && "error" in preview && (
            <p className="muted" data-testid="addon-preview-error">
              {errorText(preview.error)}
            </p>
          )}
          {preview && "lines" in preview && (
            <>
              <h2>{A.preview}</h2>
              {preview.lines[0] && (
                <p>
                  {A.service}: {day(preview.lines[0].service_start)} –{" "}
                  {day(preview.lines[0].service_end)}
                </p>
              )}
              <QuoteLines
                testId="addon-preview"
                lines={preview.lines}
                vatRateBp={preview.lines[0]?.vat_rate_bp ?? 0}
              />
              <ActionForm action={issueAddonQuoteAction} testId="addon-quote-form">
                <input type="hidden" name="base_order_id" value={o.id} />
                {selected.map((id) => (
                  <input key={id} type="hidden" name="parcel_ids" value={id} />
                ))}
                {start && <input type="hidden" name="proposed_service_start" value={start} />}
                <TermFields validDays={setting?.quote_valid_days ?? 30} />
                <div className={styles.actions}>
                  <Submit>{A.submit}</Submit>
                </div>
              </ActionForm>
            </>
          )}
        </>
      )}
    </main>
  );
}
