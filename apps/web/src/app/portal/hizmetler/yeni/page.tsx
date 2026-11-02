import Link from "next/link";
import { DemoNotice } from "@/components/demo/demo-notice";
import { demoSignupNext } from "@/components/demo/demo-shell";
import layout from "@/components/portal/page.module.css";
import styles from "@/components/services/services.module.css";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Facts } from "@/components/ui/facts";
import { Checkbox, Field, Select, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { requireSection } from "@/lib/auth/session";
import { formatDonum } from "@/lib/billing/money";
import { demoText } from "@/lib/i18n/messages/demo";
import { servicesText as S } from "@/lib/i18n/messages/services";
import { SERVICE_TERMS_VERSION } from "@/lib/legal/versions";
import { istanbulToday } from "@/lib/portal-billing/gardens";
import { findServiceOffer } from "@/lib/services/data";
import { dayMonthLocative, formatTl, vatPercent } from "@/lib/services/format";
import { offerCard, offerEstimate, serviceShortName } from "@/lib/services/offers";
import { NOTE_MAX, SERVICE_WINDOWS, serviceErrorText } from "@/lib/services/requests";
import { serviceHref } from "@/lib/services/urls";
import { createClient } from "@/lib/supabase/server";
import { requestServiceAction } from "../actions";

const F = S.form;

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// The request form (IP15, docs/MVP.md Module 6, "Akış"; H37): the garden,
// its area and where the area comes from, the estimate the request freezes
// (with its price list version) or, when the published price list has no
// price for the service, "Fiyat teklifle bildirilir" and no number; the preferred
// window, a note for hidden obstacles, and in season two separate required
// consents (ön bilgilendirme, ek sözleşme) plus the optional, unticked
// early-performance box of the addendum's section 10/3. Out of season the
// same form leaves a non-binding pre-request (addendum §11) without the
// consents. ?parsel=<parcel>&hizmet=<service type>.
export default async function NewServiceRequestPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const user = await requireSection("portal");
  const [query, supabase] = await Promise.all([searchParams, createClient()]);
  const parcelId = first(query.parsel) ?? "";
  const serviceTypeId = first(query.hizmet) ?? "";
  const offer = await findServiceOffer(supabase, parcelId, serviceTypeId);
  const error = serviceErrorText(first(query.hata));
  // A demo visitor sent the form (docs/demo-turu.md §11.5).
  const demoRefused = user.demo && first(query.hata) === "demo_read_only";
  const today = istanbulToday();

  if (!offer) {
    return (
      <main className={`${layout.page} ${layout.reading}`}>
        <PageHeader title={F.genericTitle} back={{ href: "/portal", label: S.list.emptyAction }} />
        {error && (
          <Alert tone="danger" role="alert">
            <p>{error}</p>
          </Alert>
        )}
        <EmptyState
          title={F.noOffer}
          action={
            <ButtonLink variant="secondary" href="/portal">
              {S.list.emptyAction}
            </ButtonLink>
          }
        />
      </main>
    );
  }

  const name = serviceShortName(offer);
  const inSeason = offer.in_season;
  const card = offerCard(offer, today);
  const back = { href: `/portal/parsel/${offer.parcel_id}`, label: F.back };
  const opens = dayMonthLocative(offer.season_start);
  const price = offerEstimate(offer);

  return (
    <main className={`${layout.page} ${layout.reading}`} data-testid="service-request-form">
      <PageHeader
        title={inSeason ? F.title(name) : F.preTitle(name)}
        lead={inSeason ? F.lead : F.preLead(opens)}
        back={back}
      />
      {demoRefused ? (
        <DemoNotice text={demoText.closed.services} signupNext={demoSignupNext()} />
      ) : (
        error && (
          <Alert tone="danger" role="alert" testId="service-request-error">
            <p>{error}</p>
          </Alert>
        )
      )}
      {offer.state === "open" && offer.open_request_id && (
        <Alert tone="info" testId="service-request-open">
          <p>
            {F.openExists(offer.open_request_number ?? "")}{" "}
            <Link href={serviceHref.request(offer.open_request_id)}>{S.card.showRequest}</Link>
          </p>
        </Alert>
      )}
      {offer.state === "recommended" && card && card.lines.length > 1 && (
        <Alert tone="info">
          <p>{card.lines[0]}</p>
        </Alert>
      )}

      <Panel title={F.summaryTitle} testId="service-request-summary">
        <Facts
          rows={[
            [F.parcel, offer.parcel_name],
            [
              F.area,
              F.areaValue(
                formatDonum(Number(offer.area_m2)),
                S.areaSource[offer.area_source] ?? offer.area_source,
              ),
            ],
            ...(price
              ? ([
                  [F.pricePerDonum, F.pricePerDonumValue(formatTl(price.perDonum))],
                  [F.minimumFee, F.minimumFeeValue(formatTl(price.minimumFee))],
                ] as [string, string][])
              : []),
          ]}
        />
        {price ? (
          <>
            <Facts
              variant="summary"
              testId="service-request-totals"
              rows={[
                [F.subtotal, formatTl(price.subtotal)],
                [F.vat(vatPercent(price.vatRateBp)), formatTl(price.vat)],
              ]}
              total={[F.total, formatTl(price.total)]}
            />
            <p className={styles.hint}>
              {inSeason ? F.frozenNote : F.preEstimateNote} {F.roundingNote}{" "}
              <span data-testid="service-request-price-list">{F.priceListNote(price.version)}</span>
            </p>
          </>
        ) : (
          <div className={styles.noPrice} data-testid="service-request-no-price">
            <p className={styles.noPriceTitle}>{F.noPriceTitle}</p>
            <p className={styles.hint}>{inSeason ? F.noPriceNote : F.preNoPriceNote}</p>
          </div>
        )}
      </Panel>

      {offer.state !== "open" && (
        <Panel testId="service-request-panel">
          <form action={requestServiceAction} className={styles.form}>
            <input type="hidden" name="parcel_id" value={offer.parcel_id} />
            <input type="hidden" name="service_type_id" value={offer.service_type_id} />
            <Field id="s-window" label={F.windowLabel} hint={F.windowHint}>
              <Select name="window" defaultValue="flexible">
                {SERVICE_WINDOWS.map((w) => (
                  <option key={w} value={w}>
                    {S.window[w]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="s-note" label={F.noteLabel} hint={F.noteHint} optional={F.optional}>
              <Textarea name="note" rows={4} maxLength={NOTE_MAX} />
            </Field>

            {inSeason ? (
              <>
                <fieldset className={styles.checks} data-testid="service-request-terms">
                  <legend>{F.termsTitle}</legend>
                  <p className={styles.hint}>
                    {F.termsIntro}{" "}
                    <Link href="/bakim-hizmeti" target="_blank" rel="noopener">
                      {F.termsLink}
                    </Link>
                  </p>
                  <Checkbox
                    id="s-pre_information"
                    name="pre_information"
                    required
                    label={price ? F.preInformationCheck : F.preInformationCheckNoPrice}
                  />
                  <Checkbox
                    id="s-terms"
                    name="terms"
                    required
                    label={
                      <>
                        {F.termsCheck}{" "}
                        <span className={layout.muted}>({F.version(SERVICE_TERMS_VERSION)})</span>
                      </>
                    }
                  />
                </fieldset>
                <fieldset className={styles.checks} data-testid="service-request-early">
                  <legend>{F.earlyTitle}</legend>
                  <Checkbox
                    id="s-early_performance"
                    name="early_performance"
                    label={F.earlyCheck}
                    hint={F.earlyHint}
                  />
                </fieldset>
              </>
            ) : (
              <p className={styles.hint} data-testid="service-request-pre-note">
                {F.preTermsNote}{" "}
                <Link href="/bakim-hizmeti" target="_blank" rel="noopener">
                  {F.termsLink}
                </Link>
              </p>
            )}

            {/* A demo visitor sees the real form; sending it writes nothing
                (requestServiceAction answers demo_read_only, shown above). */}
            <div className={layout.actions}>
              <Button type="submit" data-testid="service-request-submit">
                {inSeason ? F.submit : F.preSubmit}
              </Button>
            </div>
          </form>
        </Panel>
      )}
    </main>
  );
}
