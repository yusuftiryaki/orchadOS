import Link from "next/link";
import { acknowledgeKvkkAction, setConsentAction } from "@/app/portal/billing-actions";
import { PortalResult } from "@/components/portal-billing/result-notice";
import local from "@/components/portal-billing/portal-billing.module.css";
import styles from "@/components/portal/portal.module.css";
import { requireSection } from "@/lib/auth/session";
import { formatDate } from "@/lib/i18n";
import { billingText } from "@/lib/i18n/messages/billing";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { EXPLICIT_CONSENT_KINDS, isExplicitConsentAsked } from "@/lib/legal/consents";
import { LEGAL_TEXT_VERSIONS } from "@/lib/legal/versions";
import { getBillingProfile, getConsents, hasKvkkNotice } from "@/lib/portal-billing/data";
import { assertCustomer } from "@/lib/portal-billing/session";
import { portalHref } from "@/lib/portal-billing/urls";
import { kvkkFormEnabled } from "@/lib/portal/kvkk-request";
import { createClient } from "@/lib/supabase/server";
import { t } from "@/lib/i18n";

const C = P.consents;

// The optional explicit consents that are asked (give or withdraw at any
// time), any earlier grant of one that is no longer asked (withdraw only;
// docs/hukuk/kararlar.md H06, H31) and, when it is missing, the KVKK notice
// acknowledgement.
export default async function ConsentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  assertCustomer(await requireSection("portal"));
  const supabase = await createClient();
  // The consents of the customer's org: the one the forms below write to.
  const profile = await getBillingProfile(supabase);
  const consents = await getConsents(supabase, profile?.orgId ?? null);
  const kvkk = consents.get("kvkk_notice");
  // T11: the KVKK application form, while the org has it switched on.
  const kvkkForm = await kvkkFormEnabled(supabase);
  const shown = EXPLICIT_CONSENT_KINDS.filter(
    (kind) => isExplicitConsentAsked(kind) || consents.get(kind)?.granted === true,
  );
  return (
    <main className={styles.page}>
      <h1>{C.title}</h1>
      <PortalResult params={await searchParams} />
      <p>
        {C.lead} <Link href="/acik-riza">{C.explicitLink}</Link>
      </p>
      {kvkkForm && (
        <section className={styles.section} data-testid="kvkk-request-link">
          <p>
            <Link href="/portal/hesap/izinler/kvkk-basvurusu">{t.legal.kvkkRequest.link}</Link>
          </p>
          <p className="muted">{t.legal.kvkkRequest.linkHint}</p>
        </section>
      )}
      {!EXPLICIT_CONSENT_KINDS.some(isExplicitConsentAsked) && (
        <p data-testid="consent-none-asked">{C.noneAsked}</p>
      )}

      {shown.map((kind) => {
        const record = consents.get(kind);
        const granted = record?.granted === true;
        const asked = isExplicitConsentAsked(kind);
        return (
          <section key={kind} className={styles.section} data-testid={`consent-${kind}`}>
            <h2>{billingText.consentKind[kind]}</h2>
            <p>
              <strong data-testid="consent-state">{granted ? C.granted : C.notGranted}</strong>
              {record && (
                <span className="muted">
                  {" · "}
                  {C.recorded(formatDate(record.recordedAt), record.textVersion)}
                </span>
              )}
            </p>
            {!asked && <p className="muted">{C.noLongerAsked}</p>}
            <form action={setConsentAction}>
              <input type="hidden" name="kind" value={kind} />
              <input type="hidden" name="granted" value={granted ? "false" : "true"} />
              <button className={granted ? "button button-secondary" : "button"} type="submit">
                {granted ? C.withdraw : C.grant}
              </button>
            </form>
          </section>
        );
      })}

      <section className={styles.section} data-testid="consent-kvkk_notice">
        <h2>{C.kvkkTitle}</h2>
        {hasKvkkNotice(consents) && kvkk ? (
          <p>
            {C.kvkkDone(formatDate(kvkk.recordedAt), kvkk.textVersion)}{" "}
            <Link href="/kvkk">{C.kvkkLink}</Link>
          </p>
        ) : (
          <>
            <p>
              {C.kvkkMissing} <Link href="/kvkk">{C.kvkkLink}</Link>
            </p>
            <form action={acknowledgeKvkkAction} className={local.checks}>
              <input type="hidden" name="geri" value={portalHref.consents()} />
              <label>
                <input type="checkbox" name="kvkk_notice" required />
                <span>
                  {C.kvkkCheck} <span className="muted">({LEGAL_TEXT_VERSIONS.kvkk_notice})</span>
                </span>
              </label>
              <p>
                <button className="button" type="submit">
                  {C.kvkkSubmit}
                </button>
              </p>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
