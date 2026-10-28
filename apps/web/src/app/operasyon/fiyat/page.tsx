import Link from "next/link";
import { createDraftAction } from "@/app/operasyon/back-office-actions";
import { ActionForm } from "@/components/back-office/action-form";
import { Badge, BoResultNotice, OrgPicker, day, when } from "@/components/back-office/parts";
import { Panel } from "@/components/ui/panel";
import { Badge as UiBadge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, cell } from "@/components/ui/table";
import { requireSection } from "@/lib/auth/session";
import { chooseOrg, getPrices } from "@/lib/back-office/data";
import { boHref, firstParam } from "@/lib/back-office/urls";
import { bpToPercent } from "@/lib/back-office/validation";
import { formatNumber } from "@/lib/i18n";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { billingText } from "@/lib/i18n/messages/billing";
import { opsOrgs } from "@/lib/operations/data";
import { todayIn } from "@/lib/operations/visits";
import { createClient } from "@/lib/supabase/server";
import styles from "./prices.module.css";

const B = backOfficeText;
const T = B.prices;
const PACKAGE_STATE = { active: T.active, passive: T.passive };

// Packages and price list versions; the list in force today is marked. The
// usual change is a copy of the list in force, so that is the screen's
// primary action; a blank draft and a new package are secondary.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("operasyon");
  const query = await searchParams;
  const supabase = await createClient();
  const orgs = await opsOrgs(supabase, user.id);
  const org = chooseOrg(orgs, firstParam(query.org));
  const today = todayIn(new Date());
  const prices = org ? await getPrices(supabase, org.id, today) : null;

  const newPackage = org && (
    <ButtonLink variant="secondary" size="sm" href={boHref.packageForm(undefined, org.id)}>
      {T.newPackage}
    </ButtonLink>
  );
  const blankDraft = (primary: boolean) =>
    org && (
      <ActionForm action={createDraftAction} inline testId="new-draft">
        <input type="hidden" name="org_id" value={org.id} />
        <Button
          type="submit"
          variant={primary ? "primary" : "secondary"}
          size={primary ? "md" : "sm"}
        >
          {T.newDraft}
        </Button>
      </ActionForm>
    );

  return (
    <main className="page">
      <PageHeader
        title={T.title}
        lead={T.lead}
        actions={
          org &&
          prices &&
          (prices.inForceId ? (
            <ActionForm action={createDraftAction} inline testId="copy-in-force">
              <input type="hidden" name="org_id" value={org.id} />
              <input type="hidden" name="copy_from_id" value={prices.inForceId} />
              <Button type="submit">{T.copyInForce}</Button>
            </ActionForm>
          ) : (
            prices.packages.length > 0 && blankDraft(true)
          ))
        }
      />
      {org && <OrgPicker orgs={orgs} current={org.id} action={boHref.prices()} />}
      <BoResultNotice params={query} />
      {org && prices && (
        <>
          <Panel
            plain
            id="price-lists"
            title={T.lists}
            actions={prices.inForceId && prices.lists.length > 0 ? blankDraft(false) : undefined}
          >
            {prices.lists.length === 0 ? (
              <EmptyState headingLevel={3} title={T.noLists}>
                <p>{T.noListsBody}</p>
              </EmptyState>
            ) : (
              <Table data-testid="price-lists">
                <thead>
                  <tr>
                    <th>{T.version}</th>
                    <th>{T.status}</th>
                    <th className={cell.num}>{T.validFrom}</th>
                    <th className={cell.num}>{T.vat}</th>
                    <th className={cell.num}>{T.publishedAt}</th>
                    <th>{T.note}</th>
                  </tr>
                </thead>
                <tbody>
                  {prices.lists.map((l) => (
                    <tr
                      key={l.id}
                      data-price-list-id={l.id}
                      data-in-force={l.id === prices.inForceId || undefined}
                    >
                      <td className={cell.nowrap}>
                        <Link href={boHref.priceList(l.id)}>{T.listTitle(l.version)}</Link>
                      </td>
                      <td>
                        <span className={styles.badges}>
                          <Badge labels={billingText.priceListStatus} value={l.status} />
                          {l.id === prices.inForceId && <UiBadge tone="info">{T.inForce}</UiBadge>}
                        </span>
                      </td>
                      <td className={`${cell.num} ${cell.nowrap}`}>{day(l.valid_from)}</td>
                      <td className={cell.num}>%{bpToPercent(l.vat_rate_bp)}</td>
                      <td className={`${cell.num} ${cell.nowrap}`}>{when(l.published_at)}</td>
                      <td className={styles.note}>{l.note ?? B.none}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Panel>

          <Panel
            plain
            id="packages"
            title={T.packages}
            description={T.packagesHint}
            actions={prices.packages.length > 0 ? newPackage : undefined}
          >
            {prices.packages.length === 0 ? (
              <EmptyState
                headingLevel={3}
                title={T.noPackages}
                action={
                  <ButtonLink href={boHref.packageForm(undefined, org.id)}>
                    {T.newPackage}
                  </ButtonLink>
                }
              >
                <p>{T.noPackagesBody}</p>
              </EmptyState>
            ) : (
              <Table data-testid="package-list">
                <thead>
                  <tr>
                    <th>{T.name}</th>
                    <th>{T.code}</th>
                    <th className={cell.num}>{T.visits}</th>
                    <th>{T.inventory}</th>
                    <th>{T.status}</th>
                    <th aria-label={T.edit} />
                  </tr>
                </thead>
                <tbody>
                  {prices.packages.map((p) => (
                    <tr key={p.id} data-package-code={p.code}>
                      <td className={cell.nowrap}>{p.name}</td>
                      <td className={cell.code}>{p.code}</td>
                      <td className={cell.num}>{formatNumber(p.periodic_visits_per_year)}</td>
                      <td>{p.includes_inventory ? B.yes : B.no}</td>
                      <td>
                        <Badge labels={PACKAGE_STATE} value={p.active ? "active" : "passive"} />
                      </td>
                      <td className={cell.num}>
                        <ButtonLink
                          variant="secondary"
                          size="sm"
                          href={boHref.packageForm(p.id)}
                          aria-label={`${p.name}: ${T.edit}`}
                        >
                          {T.edit}
                        </ButtonLink>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Panel>
        </>
      )}
    </main>
  );
}
