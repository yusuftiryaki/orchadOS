import Link from "next/link";
import { notFound } from "next/navigation";
import {
  createDraftAction,
  deleteDraftAction,
  publishDraftAction,
  saveDraftAction,
} from "@/app/operasyon/back-office-actions";
import { ActionForm } from "@/components/back-office/action-form";
import {
  Badge,
  BoResultNotice,
  Facts,
  Submit,
  day,
  money,
  when,
} from "@/components/back-office/parts";
import { Field } from "@/components/operations/field";
import styles from "@/components/operations/operations.module.css";
import { requireSection } from "@/lib/auth/session";
import { getPriceList } from "@/lib/back-office/data";
import { boHref } from "@/lib/back-office/urls";
import { bpToPercent } from "@/lib/back-office/validation";
import { formatKurus } from "@/lib/billing/money";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { billingText } from "@/lib/i18n/messages/billing";
import { createClient } from "@/lib/supabase/server";

const B = backOfficeText;
const T = B.prices;

// Kuruş → the TL text of a form field ("12.500,00").
const tl = (kurus: number | null | undefined) =>
  kurus == null ? "" : formatKurus(kurus).replace(/\s*₺$/, "");

// A price list: a draft is edited, published or deleted; a published list is
// read only and can be copied into a new draft.
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSection("operasyon");
  const { id } = await params;
  const supabase = await createClient();
  const view = await getPriceList(supabase, id);
  if (!view) notFound();
  const { list: l, items, packages } = view;
  const byPackage = new Map(items.map((i) => [i.package_id, i]));
  const draft = l.status === "draft";

  return (
    <main className="page">
      <p>
        <Link href={boHref.prices(undefined, l.org_id)}>← {T.title}</Link>
      </p>
      <h1>{T.listTitle(l.version)}</h1>
      <BoResultNotice params={await searchParams} />
      <Facts
        testId="price-list-facts"
        rows={[
          [T.status, <Badge key="s" labels={billingText.priceListStatus} value={l.status} />],
          [T.validFrom, day(l.valid_from)],
          [T.vat, `%${bpToPercent(l.vat_rate_bp)}`],
          [T.publishedAt, when(l.published_at)],
        ]}
      />

      {draft ? (
        <>
          <p className="muted">{T.draftHint}</p>
          <ActionForm action={saveDraftAction} testId="price-list-draft">
            <input type="hidden" name="price_list_id" value={l.id} />
            <div className={styles.grid}>
              <Field label={T.validFrom}>
                <input type="date" name="valid_from" defaultValue={l.valid_from ?? ""} />
              </Field>
              <Field label={T.vatPercent}>
                <input
                  name="vat_percent"
                  inputMode="decimal"
                  defaultValue={bpToPercent(l.vat_rate_bp)}
                  required
                />
              </Field>
              <Field label={T.note} optional wide>
                <input name="note" defaultValue={l.note ?? ""} maxLength={1000} />
              </Field>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{T.name}</th>
                    <th>{T.unitPrice}</th>
                    <th>{T.minimumFee}</th>
                    <th>{T.inventoryFee}</th>
                  </tr>
                </thead>
                <tbody>
                  {packages.map((p) => {
                    const item = byPackage.get(p.id);
                    return (
                      <tr key={p.id} data-package-code={p.code}>
                        <td>
                          <input type="hidden" name="package_ids" value={p.id} />
                          {p.name}
                          {!p.active && <span className="muted"> · {T.passive}</span>}
                        </td>
                        <td>
                          <input
                            name={`unit_${p.id}`}
                            aria-label={`${p.name}: ${T.unitPrice}`}
                            inputMode="decimal"
                            defaultValue={tl(item?.unit_price_kurus)}
                          />
                        </td>
                        <td>
                          <input
                            name={`min_${p.id}`}
                            aria-label={`${p.name}: ${T.minimumFee}`}
                            inputMode="decimal"
                            defaultValue={tl(item?.minimum_fee_kurus)}
                          />
                        </td>
                        <td>
                          <input
                            name={`inv_${p.id}`}
                            aria-label={`${p.name}: ${T.inventoryFee}`}
                            inputMode="decimal"
                            defaultValue={tl(item?.inventory_fee_kurus)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className={styles.actions}>
              <Submit>{T.saveDraft}</Submit>
            </div>
          </ActionForm>
          <div className={styles.columns}>
            <section className={styles.section}>
              <h2>{T.publish}</h2>
              <ActionForm action={publishDraftAction} testId="publish-form">
                <input type="hidden" name="price_list_id" value={l.id} />
                <label className={styles.check}>
                  <input type="checkbox" name="confirm" required />
                  {T.publishConfirm}
                </label>
                <div className={styles.actions}>
                  <Submit>{T.publish}</Submit>
                </div>
              </ActionForm>
            </section>
            <section className={styles.section}>
              <h2>{T.deleteDraft}</h2>
              <ActionForm action={deleteDraftAction} testId="delete-draft-form">
                <input type="hidden" name="price_list_id" value={l.id} />
                <input type="hidden" name="org_id" value={l.org_id} />
                <div className={styles.actions}>
                  <Submit secondary>{T.deleteDraft}</Submit>
                </div>
              </ActionForm>
            </section>
          </div>
        </>
      ) : (
        <>
          <p className="muted">{T.readOnly}</p>
          <div className={styles.tableWrap}>
            <table className={styles.table} data-testid="price-list-items">
              <thead>
                <tr>
                  <th>{T.name}</th>
                  <th className={styles.number}>{T.unitPrice}</th>
                  <th className={styles.number}>{T.minimumFee}</th>
                  <th className={styles.number}>{T.inventoryFee}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const p = packages.find((x) => x.id === i.package_id);
                  return (
                    <tr key={i.id}>
                      <td>{p?.name ?? T.packageMissing}</td>
                      <td className={styles.number}>{money(i.unit_price_kurus)}</td>
                      <td className={styles.number}>{money(i.minimum_fee_kurus)}</td>
                      <td className={styles.number}>{money(i.inventory_fee_kurus)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ActionForm action={createDraftAction} inline testId="copy-to-draft">
            <input type="hidden" name="org_id" value={l.org_id} />
            <input type="hidden" name="copy_from_id" value={l.id} />
            <Submit>{T.copyToDraft}</Submit>
          </ActionForm>
        </>
      )}
    </main>
  );
}
