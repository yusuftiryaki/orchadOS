import { updateServiceTypeAction } from "@/app/operasyon/hizmet/actions";
import { ActionForm } from "@/components/back-office/action-form";
import { OrgPicker, money } from "@/components/back-office/parts";
import { Field, Notice } from "@/components/operations/field";
import ops from "@/components/operations/operations.module.css";
import { ServiceQuotePreview } from "@/components/operations/service-quote-preview";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { requireSection } from "@/lib/auth/session";
import { chooseOrg } from "@/lib/back-office/data";
import { firstParam } from "@/lib/back-office/urls";
import { bpToPercent } from "@/lib/back-office/validation";
import { formatKurus } from "@/lib/billing/money";
import { opsServicesText } from "@/lib/i18n/messages/ops-services";
import { opsOrgs } from "@/lib/operations/data";
import { listServiceTypes, type ServiceTypeRow } from "@/lib/operations/service-data";
import { readServiceNotice, serviceHref } from "@/lib/operations/services";
import { createClient } from "@/lib/supabase/server";
import styles from "../service.module.css";

const S = opsServicesText;
const C = S.catalog;

// Kuruş → the TL value of an amount field ("375,00").
const tl = (kurus: number) => formatKurus(kurus).replace(/\s*₺$/, "");
const monthDay = (month: number, day: number) => `${day} ${S.months[month - 1]}`;

// The service catalogue of an org (IP15): price per dönüm, minimum fee, VAT,
// the draft flag, the season and the recommendation rule, with a preview of
// what a parcel would pay. A change applies to new requests only.
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
      <Alert tone="warning" testId="service-catalog-draft">
        <p>{C.draftWarning}</p>
      </Alert>
      {types.length === 0 ? (
        <EmptyState title={C.empty} />
      ) : (
        types.map((t) => <TypeForm key={t.id} type={t} org={org?.id ?? null} />)
      )}
    </main>
  );
}

function TypeForm({ type: t, org }: { type: ServiceTypeRow; org: string | null }) {
  const id = (name: string) => `st-${t.id}-${name}`;
  const months = S.months.map((name, i) => (
    <option key={name} value={i + 1}>
      {name}
    </option>
  ));
  const days = Array.from({ length: 31 }, (_, i) => (
    <option key={i} value={i + 1}>
      {i + 1}
    </option>
  ));
  return (
    <Panel
      title={t.name}
      description={`${C.perDonum(money(t.price_per_donum_kurus))} · ${C.season(
        monthDay(t.season_start_month, t.season_start_day),
        monthDay(t.season_end_month, t.season_end_day),
      )}`}
      testId={`service-type-${t.code}`}
      actions={
        <span className={styles.badges}>
          {t.price_is_draft && <Badge tone="warning">{S.draftPrice}</Badge>}
          <Badge tone={t.active ? "success" : "neutral"}>{t.active ? C.active : C.passive}</Badge>
        </span>
      }
    >
      <ActionForm action={updateServiceTypeAction} testId={`service-type-form-${t.code}`}>
        <input type="hidden" name="service_type_id" value={t.id} />
        {org && <input type="hidden" name="org" value={org} />}
        <div className={ops.grid}>
          <Field label={C.price}>
            <input
              id={id("price")}
              name="price"
              inputMode="decimal"
              defaultValue={tl(t.price_per_donum_kurus)}
              required
            />
          </Field>
          <Field label={C.minimumFee}>
            <input
              id={id("minimum_fee")}
              name="minimum_fee"
              inputMode="decimal"
              defaultValue={tl(t.minimum_fee_kurus)}
            />
          </Field>
          <Field label={C.vatRate}>
            <input
              id={id("vat_rate")}
              name="vat_rate"
              inputMode="decimal"
              defaultValue={bpToPercent(t.vat_rate_bp)}
              required
            />
          </Field>
        </div>
        <ServiceQuotePreview
          initial={{
            price: tl(t.price_per_donum_kurus),
            minimumFee: tl(t.minimum_fee_kurus),
            vatRate: bpToPercent(t.vat_rate_bp),
          }}
        />
        <Checkbox
          id={id("draft")}
          name="price_is_draft"
          defaultChecked={t.price_is_draft}
          label={C.draft}
        />
        <div className={ops.grid}>
          <Field label={`${C.seasonStart}: ${C.month}`}>
            <Select
              id={id("ssm")}
              name="season_start_month"
              defaultValue={String(t.season_start_month)}
            >
              {months}
            </Select>
          </Field>
          <Field label={`${C.seasonStart}: ${C.day}`}>
            <Select
              id={id("ssd")}
              name="season_start_day"
              defaultValue={String(t.season_start_day)}
            >
              {days}
            </Select>
          </Field>
          <Field label={`${C.seasonEnd}: ${C.month}`} hint={C.seasonHint}>
            <Select
              id={id("sem")}
              name="season_end_month"
              defaultValue={String(t.season_end_month)}
            >
              {months}
            </Select>
          </Field>
          <Field label={`${C.seasonEnd}: ${C.day}`}>
            <Select id={id("sed")} name="season_end_day" defaultValue={String(t.season_end_day)}>
              {days}
            </Select>
          </Field>
        </div>
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
        <Checkbox id={id("active")} name="active" defaultChecked={t.active} label={C.activeLabel} />
        <div className={ops.actions}>
          <Button type="submit">{C.save}</Button>
        </div>
      </ActionForm>
    </Panel>
  );
}
