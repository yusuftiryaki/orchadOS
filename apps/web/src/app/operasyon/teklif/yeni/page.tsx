import Link from "next/link";
import { notFound } from "next/navigation";
import { issueParcelQuoteAction } from "@/app/operasyon/back-office-actions";
import { ActionForm } from "@/components/back-office/action-form";
import { BoResultNotice, Submit } from "@/components/back-office/parts";
import { Field } from "@/components/operations/field";
import { OpsNav } from "@/components/operations/ops-nav";
import styles from "@/components/operations/operations.module.css";
import { requireSection } from "@/lib/auth/session";
import { getOrder, getPrices, getSetting, ownerParcels } from "@/lib/back-office/data";
import { boHref, firstParam } from "@/lib/back-office/urls";
import { addDays } from "@/lib/back-office/validation";
import { formatDonum } from "@/lib/billing/money";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { getOwnerProfile } from "@/lib/operations/data";
import { todayIn } from "@/lib/operations/visits";
import { createClient } from "@/lib/supabase/server";

const B = backOfficeText;
const T = B.quote;

// A quote for existing parcels (ops_issue_parcel_quote): the first order of
// an owner's parcels (?sahip=<profile>) or the renewal of an order
// (?siparis=<order>), whose service starts the day after the old one ends.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSection("operasyon");
  const query = await searchParams;
  const supabase = await createClient();
  const today = todayIn(new Date());

  let orgId: string;
  let customerUserId: string;
  let customerName: string | null = null;
  let parcels: { id: string; name: string; areaM2: number | null }[];
  let renewal: { id: string; number: string } | null = null;
  let packageId: string | null = null;
  let start = today;
  let back: string;

  const orderId = firstParam(query.siparis);
  const profileId = firstParam(query.sahip);
  if (orderId) {
    const view = await getOrder(supabase, orderId);
    if (!view) notFound();
    orgId = view.order.org_id;
    customerUserId = view.order.customer_user_id;
    customerName = view.summary?.customer_name ?? null;
    parcels = view.items
      .filter((i) => i.parcel_id)
      .map((i) => ({ id: i.parcel_id!, name: i.parcelName ?? i.garden_name, areaM2: null }));
    renewal = { id: view.order.id, number: view.order.number };
    if (view.order.service_end) start = addDays(view.order.service_end, 1);
    const { data } = await supabase
      .from("quote")
      .select("package_id")
      .eq("id", view.order.quote_id)
      .maybeSingle();
    packageId = data?.package_id ?? null;
    back = boHref.order(view.order.id);
  } else if (profileId) {
    const profile = await getOwnerProfile(supabase, profileId);
    if (!profile) notFound();
    orgId = profile.org_id;
    customerUserId = profile.user_id;
    customerName = profile.full_name;
    parcels = (await ownerParcels(supabase, profile.user_id)).filter((p) => p.orgId === orgId);
    back = boHref.customer(profile.id);
  } else {
    notFound();
  }

  const [prices, setting] = await Promise.all([
    getPrices(supabase, orgId, today),
    getSetting(supabase, orgId),
  ]);
  const packages = prices.packages.filter((p) => p.active);

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
      {parcels.length === 0 ? (
        <p className="muted">{T.noParcels}</p>
      ) : (
        <ActionForm action={issueParcelQuoteAction} testId="parcel-quote-form">
          <input type="hidden" name="org_id" value={orgId} />
          <input type="hidden" name="customer_user_id" value={customerUserId} />
          {renewal && <input type="hidden" name="renewal_of_order_id" value={renewal.id} />}
          <fieldset className={styles.fieldset}>
            <legend>{T.parcels}</legend>
            {parcels.map((p) => (
              <label key={p.id} className={styles.check}>
                <input type="checkbox" name="parcel_ids" value={p.id} defaultChecked />
                {p.name}
                {p.areaM2 != null && (
                  <span className="muted"> · {formatDonum(Number(p.areaM2))}</span>
                )}
              </label>
            ))}
          </fieldset>
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
          <Field
            label={B.fields.valid_days}
            hint={T.validDaysHint(setting?.quote_valid_days ?? 30)}
            optional
          >
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
          <div className={styles.actions}>
            <Submit>{T.submit}</Submit>
          </div>
        </ActionForm>
      )}
    </main>
  );
}
