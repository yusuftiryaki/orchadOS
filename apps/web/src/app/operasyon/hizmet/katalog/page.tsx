import Link from "next/link";
import { saveServiceSeasonAction, updateServiceTypeAction } from "@/app/operasyon/hizmet/actions";
import { ActionForm } from "@/components/back-office/action-form";
import { OrgPicker, money } from "@/components/back-office/parts";
import { Field, Notice } from "@/components/operations/field";
import ops from "@/components/operations/operations.module.css";
import { ServiceQuotePreview } from "@/components/operations/service-quote-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { Table, cell } from "@/components/ui/table";
import { requireSection } from "@/lib/auth/session";
import { chooseOrg } from "@/lib/back-office/data";
import { boHref, firstParam } from "@/lib/back-office/urls";
import { opsServicesText } from "@/lib/i18n/messages/ops-services";
import { opsOrgs } from "@/lib/operations/data";
import {
  currentServicePricing,
  listFruitSpecies,
  listServiceSeasons,
  listServiceTypes,
  type ServicePricing,
  type ServiceSeasonRow,
  type ServiceTypeRow,
  type SpeciesRow,
} from "@/lib/operations/service-data";
import { readServiceNotice, serviceHref } from "@/lib/operations/services";
import { todayIn } from "@/lib/operations/visits";
import { createClient } from "@/lib/supabase/server";
import styles from "../service.module.css";

const S = opsServicesText;
const C = S.catalog;

const monthDay = (month: number, day: number) => `${day} ${S.months[month - 1]}`;
const seasonText = (w: {
  season_start_month: number;
  season_start_day: number;
  season_end_month: number;
  season_end_day: number;
}) =>
  C.season(
    monthDay(w.season_start_month, w.season_start_day),
    monthDay(w.season_end_month, w.season_end_day),
  );

// The service catalogue of an org (IP15): the default season, the season per
// fruit species, the recommendation rule and whether the service is offered.
// Prices are not edited here: they live in the versioned price list
// ("Hizmet fiyatları" of a draft). The page says which published version
// prices each service today, or that none does (the portal then shows
// "Fiyat teklifle bildirilir" and ops enters the amount when scheduling).
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
  const types = org ? await listServiceTypes(supabase, [org.id]) : [];
  const [species, seasons, pricing] = await Promise.all([
    listFruitSpecies(supabase),
    listServiceSeasons(
      supabase,
      types.map((t) => t.id),
    ),
    org ? currentServicePricing(supabase, org.id, todayIn(new Date())) : null,
  ]);
  const notice = readServiceNotice(query);

  return (
    <main className="page">
      <PageHeader
        title={C.title}
        lead={C.lead}
        back={{ href: serviceHref.queue(), label: S.backToQueue }}
      />
      {org && <OrgPicker orgs={orgs} current={org.id} action={serviceHref.catalog()} />}
      {notice && <Notice>{S.notices[notice]}</Notice>}
      {types.length === 0 ? (
        <EmptyState title={C.empty} />
      ) : (
        types.map((t) => (
          <ServiceType
            key={t.id}
            type={t}
            org={org?.id ?? null}
            species={species}
            seasons={seasons.filter((s) => s.service_type_id === t.id)}
            price={pricing?.prices.get(t.id) ?? null}
            pricesHref={org ? boHref.prices(undefined, org.id) : null}
          />
        ))
      )}
    </main>
  );
}

function monthOptions() {
  return S.months.map((name, i) => (
    <option key={name} value={i + 1}>
      {name}
    </option>
  ));
}

function dayOptions() {
  return Array.from({ length: 31 }, (_, i) => (
    <option key={i} value={i + 1}>
      {i + 1}
    </option>
  ));
}

// Four selects of a season window (field names as parseSeason reads them).
function SeasonFields({
  idPrefix,
  initial,
}: {
  idPrefix: string;
  initial: { sm: number; sd: number; em: number; ed: number };
}) {
  return (
    <div className={ops.grid}>
      <Field label={`${C.seasonStart}: ${C.month}`}>
        <Select id={`${idPrefix}-ssm`} name="season_start_month" defaultValue={String(initial.sm)}>
          {monthOptions()}
        </Select>
      </Field>
      <Field label={`${C.seasonStart}: ${C.day}`}>
        <Select id={`${idPrefix}-ssd`} name="season_start_day" defaultValue={String(initial.sd)}>
          {dayOptions()}
        </Select>
      </Field>
      <Field label={`${C.seasonEnd}: ${C.month}`} hint={C.seasonHint}>
        <Select id={`${idPrefix}-sem`} name="season_end_month" defaultValue={String(initial.em)}>
          {monthOptions()}
        </Select>
      </Field>
      <Field label={`${C.seasonEnd}: ${C.day}`}>
        <Select id={`${idPrefix}-sed`} name="season_end_day" defaultValue={String(initial.ed)}>
          {dayOptions()}
        </Select>
      </Field>
    </div>
  );
}

function ServiceType({
  type: t,
  org,
  species,
  seasons,
  price,
  pricesHref,
}: {
  type: ServiceTypeRow;
  org: string | null;
  species: SpeciesRow[];
  seasons: ServiceSeasonRow[];
  price: ServicePricing | null;
  pricesHref: string | null;
}) {
  const id = (name: string) => `st-${t.id}-${name}`;
  const bySpecies = new Map(seasons.map((s) => [s.species, s]));
  const pistachio = bySpecies.get("antep_fistigi");
  const shown = species.filter((s) => s.active || bySpecies.has(s.code));
  return (
    <>
      <Panel
        title={t.name}
        description={`${C.defaultSeason}: ${seasonText(t)}`}
        testId={`service-type-${t.code}`}
        actions={
          <span className={styles.badges}>
            {!price && <Badge tone="warning">{C.unpricedBadge}</Badge>}
            <Badge tone={t.active ? "success" : "neutral"}>{t.active ? C.active : C.passive}</Badge>
          </span>
        }
      >
        <section data-testid={`service-type-price-${t.code}`} data-priced={!!price}>
          <h3 className={styles.subTitle}>{C.priceTitle}</h3>
          {price ? (
            <>
              <p>
                {C.pricedBy(price.version)}: {C.perDonum(money(price.unitPriceKurus))},{" "}
                {C.minimum(money(price.minimumFeeKurus))}
              </p>
              <ServiceQuotePreview
                unitPriceKurus={price.unitPriceKurus}
                minimumFeeKurus={price.minimumFeeKurus}
                vatRateBp={price.vatRateBp}
              />
            </>
          ) : (
            <p>{C.unpriced}</p>
          )}
          <p className={styles.hint}>
            {C.priceWhere} {pricesHref && <Link href={pricesHref}>{C.priceLink}</Link>}
          </p>
        </section>

        <ActionForm action={updateServiceTypeAction} testId={`service-type-form-${t.code}`}>
          <input type="hidden" name="service_type_id" value={t.id} />
          {org && <input type="hidden" name="org" value={org} />}
          <h3 className={styles.subTitle}>{C.defaultSeason}</h3>
          <p className={styles.hint}>{C.defaultSeasonHint}</p>
          <SeasonFields
            idPrefix={id("default")}
            initial={{
              sm: t.season_start_month,
              sd: t.season_start_day,
              em: t.season_end_month,
              ed: t.season_end_day,
            }}
          />
          <div className={ops.grid}>
            <Field label={C.recommendFrom}>
              <Select
                id={id("recommend")}
                name="recommend_from"
                defaultValue={t.recommend_from_weed_height ?? ""}
              >
                <option value="">{C.recommendNone}</option>
                <option value="medium">{C.recommendMedium}</option>
                <option value="tall">{C.recommendTall}</option>
              </Select>
            </Field>
            <Field label={C.maxAge}>
              <input
                id={id("max_age")}
                name="observation_max_age_days"
                type="number"
                min={1}
                max={365}
                defaultValue={t.observation_max_age_days}
                required
              />
            </Field>
          </div>
          <Checkbox
            id={id("active")}
            name="active"
            defaultChecked={t.active}
            label={C.activeLabel}
          />
          <div className={ops.actions}>
            <Button type="submit">{C.save}</Button>
          </div>
        </ActionForm>
      </Panel>

      <Panel
        title={C.speciesTitle(t.name)}
        description={C.speciesLead}
        testId={`service-type-seasons-${t.code}`}
      >
        <Table data-testid={`service-type-season-table-${t.code}`}>
          <thead>
            <tr>
              <th>{C.species}</th>
              <th>{C.window}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => {
              const own = bySpecies.get(s.code);
              return (
                <tr key={s.code} data-species={s.code}>
                  <td className={cell.nowrap}>{s.name}</td>
                  <td>{own ? seasonText(own) : `${seasonText(t)} (${C.fromDefault})`}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <ActionForm action={saveServiceSeasonAction} testId={`service-season-form-${t.code}`}>
          <input type="hidden" name="service_type_id" value={t.id} />
          {org && <input type="hidden" name="org" value={org} />}
          <h3 className={styles.subTitle}>{C.speciesEdit}</h3>
          <Field label={C.species}>
            <Select id={id("species")} name="species" defaultValue="antep_fistigi">
              {species
                .filter((s) => s.active)
                .map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
            </Select>
          </Field>
          <SeasonFields
            idPrefix={id("species")}
            initial={{
              sm: pistachio?.season_start_month ?? t.season_start_month,
              sd: pistachio?.season_start_day ?? t.season_start_day,
              em: pistachio?.season_end_month ?? t.season_end_month,
              ed: pistachio?.season_end_day ?? t.season_end_day,
            }}
          />
          <div className={ops.actions}>
            <Button type="submit" variant="secondary">
              {C.speciesSave}
            </Button>
          </div>
        </ActionForm>
      </Panel>
    </>
  );
}
