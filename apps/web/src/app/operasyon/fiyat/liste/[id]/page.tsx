import { notFound } from "next/navigation";
import {
  createDraftAction,
  deleteDraftAction,
  publishDraftAction,
  saveDraftAction,
} from "@/app/operasyon/back-office-actions";
import { ActionForm } from "@/components/back-office/action-form";
import { Badges } from "@/components/back-office/money-ui";
import { Badge, BoResultNotice, Facts, day, money, when } from "@/components/back-office/parts";
import { Field } from "@/components/operations/field";
import styles from "@/components/operations/operations.module.css";
import { Panel } from "@/components/ui/panel";
import { Split } from "@/components/ui/layout";
import { Badge as UiBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Consequence, Disclosure } from "@/components/ui/disclosure";
import { Checkbox } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Table, cell } from "@/components/ui/table";
import { requireSection } from "@/lib/auth/session";
import { getPriceList } from "@/lib/back-office/data";
import { boHref } from "@/lib/back-office/urls";
import { bpToPercent } from "@/lib/back-office/validation";
import { formatKurus } from "@/lib/billing/money";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { billingText } from "@/lib/i18n/messages/billing";
import { createClient } from "@/lib/supabase/server";
import prices from "../../prices.module.css";

const B = backOfficeText;
const T = B.prices;

// Kuruş → the TL text of a form field ("12.500,00").
const tl = (kurus: number | null | undefined) =>
  kurus == null ? "" : formatKurus(kurus).replace(/\s*₺$/, "");

// A price list: a draft is edited, published or deleted; a published list is
// read only and can be copied into a new draft. Publishing cannot be undone,
// so its panel says what happens and asks for a confirmation.
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
  const [view, query] = await Promise.all([getPriceList(supabase, id), searchParams]);
  if (!view) notFound();
  const { list: l, items, packages } = view;
  const byPackage = new Map(items.map((i) => [i.package_id, i]));
  const draft = l.status === "draft";

  return (
    <main className="page">
      <PageHeader
        back={{ href: boHref.prices(undefined, l.org_id), label: T.title }}
        title={T.listTitle(l.version)}
        meta={<Badge labels={billingText.priceListStatus} value={l.status} />}
        lead={draft ? T.draftHint : T.readOnly}
      />
      <BoResultNotice params={query} />

      {draft ? (
        <>
          <Panel title={T.items}>
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
              <Table>
                <thead>
                  <tr>
                    <th>{T.name}</th>
                    <th className={cell.num}>{T.unitPrice}</th>
                    <th className={cell.num}>{T.minimumFee}</th>
                    <th className={cell.num}>{T.inventoryFee}</th>
                  </tr>
                </thead>
                <tbody>
                  {packages.map((p) => {
                    const item = byPackage.get(p.id);
                    return (
                      <tr key={p.id} data-package-code={p.code}>
                        <td>
                          <input type="hidden" name="package_ids" value={p.id} />
                          <Badges>
                            <span className={cell.nowrap}>{p.name}</span>
                            {!p.active && <UiBadge>{T.passive}</UiBadge>}
                          </Badges>
                        </td>
                        <td className={cell.num}>
                          <input
                            className={prices.priceInput}
                            name={`unit_${p.id}`}
                            aria-label={`${p.name}: ${T.unitPrice}`}
                            inputMode="decimal"
                            defaultValue={tl(item?.unit_price_kurus)}
                          />
                        </td>
                        <td className={cell.num}>
                          <input
                            className={prices.priceInput}
                            name={`min_${p.id}`}
                            aria-label={`${p.name}: ${T.minimumFee}`}
                            inputMode="decimal"
                            defaultValue={tl(item?.minimum_fee_kurus)}
                          />
                        </td>
                        <td className={cell.num}>
                          <input
                            className={prices.priceInput}
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
              </Table>
              <div className={styles.actions}>
                <Button type="submit" variant="secondary">
                  {T.saveDraft}
                </Button>
              </div>
            </ActionForm>
          </Panel>
          <div className={prices.finish}>
            <Panel title={T.publishTitle} testId="publish-panel">
              <Consequence>
                {l.valid_from ? T.publishFrom(day(l.valid_from)) : T.publishNoDate}
              </Consequence>
              <Consequence>{T.publishConsequence}</Consequence>
              <ActionForm action={publishDraftAction} testId="publish-form">
                <input type="hidden" name="price_list_id" value={l.id} />
                <Checkbox id="publish-confirm" name="confirm" required label={T.publishConfirm} />
                <div className={styles.actions}>
                  <Button type="submit">{T.publish}</Button>
                </div>
              </ActionForm>
            </Panel>
            <Disclosure title={T.deleteDraft}>
              <Consequence>{T.deleteConsequence}</Consequence>
              <ActionForm action={deleteDraftAction} testId="delete-draft-form">
                <input type="hidden" name="price_list_id" value={l.id} />
                <input type="hidden" name="org_id" value={l.org_id} />
                <div className={styles.actions}>
                  <Button type="submit" variant="danger">
                    {T.deleteDraft}
                  </Button>
                </div>
              </ActionForm>
            </Disclosure>
          </div>
        </>
      ) : (
        <>
          <Split
            aside={
              <Panel title={T.newVersion}>
                <Consequence>{T.copyHint}</Consequence>
                <ActionForm action={createDraftAction} inline testId="copy-to-draft">
                  <input type="hidden" name="org_id" value={l.org_id} />
                  <input type="hidden" name="copy_from_id" value={l.id} />
                  <Button type="submit">{T.copyToDraft}</Button>
                </ActionForm>
              </Panel>
            }
          >
            <Panel title={T.details}>
              <Facts
                testId="price-list-facts"
                rows={[
                  [T.validFrom, day(l.valid_from)],
                  [T.vat, `%${bpToPercent(l.vat_rate_bp)}`],
                  [T.publishedAt, when(l.published_at)],
                  [T.note, l.note ?? B.none],
                ]}
              />
            </Panel>
          </Split>
          <Panel plain title={T.items}>
            <Table data-testid="price-list-items">
              <thead>
                <tr>
                  <th>{T.name}</th>
                  <th className={cell.num}>{T.unitPrice}</th>
                  <th className={cell.num}>{T.minimumFee}</th>
                  <th className={cell.num}>{T.inventoryFee}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const p = packages.find((x) => x.id === i.package_id);
                  return (
                    <tr key={i.id}>
                      <td className={cell.nowrap}>{p?.name ?? T.packageMissing}</td>
                      <td className={`${cell.num} ${cell.nowrap}`}>{money(i.unit_price_kurus)}</td>
                      <td className={`${cell.num} ${cell.nowrap}`}>{money(i.minimum_fee_kurus)}</td>
                      <td className={`${cell.num} ${cell.nowrap}`}>
                        {money(i.inventory_fee_kurus)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Panel>
        </>
      )}
    </main>
  );
}
