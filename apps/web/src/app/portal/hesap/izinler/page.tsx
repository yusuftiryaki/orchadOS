import Link from "next/link";
import { acknowledgeKvkkAction, setConsentAction } from "@/app/portal/billing-actions";
import { Setting, SettingsShell } from "@/components/portal-billing/settings-shell";
import w from "@/components/portal-billing/workspace.module.css";
import { PortalResult } from "@/components/portal-billing/result-notice";
import layout from "@/components/portal/page.module.css";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { requireSection } from "@/lib/auth/session";
import { formatDate, t } from "@/lib/i18n";
import { billingText } from "@/lib/i18n/messages/billing";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { EXPLICIT_CONSENT_KINDS, isExplicitConsentAsked } from "@/lib/legal/consents";
import { LEGAL_TEXT_VERSIONS } from "@/lib/legal/versions";
import { getBillingProfile, getConsents, hasKvkkNotice } from "@/lib/portal-billing/data";
import { assertCustomer } from "@/lib/portal-billing/session";
import { portalHref } from "@/lib/portal-billing/urls";
import { kvkkFormEnabled } from "@/lib/portal/kvkk-request";
import { createClient } from "@/lib/supabase/server";

const C = P.consents;
const K = t.legal.kvkkRequest;

// The optional explicit consents that are asked (give or withdraw at any
// time), any earlier grant of one that is no longer asked (withdraw only;
// docs/hukuk/kararlar.md H06, H31) and, when it is missing, the KVKK notice
// acknowledgement. The wording is legal: only the layout is the portal's.
export default async function ConsentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  assertCustomer(await requireSection("portal"));
  const supabase = await createClient();
  // The consents of the customer's org: the one the forms below write to.
  // T11: the KVKK application form, while the org has it switched on.
  const [params, profile, kvkkForm] = await Promise.all([
    searchParams,
    getBillingProfile(supabase),
    kvkkFormEnabled(supabase),
  ]);
  const consents = await getConsents(supabase, profile?.orgId ?? null);
  const kvkk = consents.get("kvkk_notice");
  const kvkkDone = hasKvkkNotice(consents) && !!kvkk;
  const shown = EXPLICIT_CONSENT_KINDS.filter(
    (kind) => isExplicitConsentAsked(kind) || consents.get(kind)?.granted === true,
  );
  return (
    <main className={layout.page}>
      <SettingsShell current="consents">
        <PageHeader
          title={C.title}
          lead={
            <>
              {C.lead} <Link href="/acik-riza">{C.explicitLink}</Link>
            </>
          }
        />
        <PortalResult params={params} />

        <Setting title={C.kvkkTitle} id="consent-kvkk" testId="consent-kvkk_notice">
          <div className={w.formCard}>
            <div className={w.formCardBody}>
              <div className={w.dangerRow}>
                <div>
                  {kvkkDone && kvkk ? (
                    <p>
                      {C.kvkkDone(formatDate(kvkk.recordedAt), kvkk.textVersion)}{" "}
                      <Link href="/kvkk">{C.kvkkLink}</Link>
                    </p>
                  ) : (
                    <p>
                      {C.kvkkMissing} <Link href="/kvkk">{C.kvkkLink}</Link>
                    </p>
                  )}
                </div>
                <Badge tone={kvkkDone ? "success" : "warning"}>
                  {kvkkDone ? C.kvkkRead : C.kvkkUnread}
                </Badge>
              </div>
            </div>
            {!(kvkkDone && kvkk) && (
              <form action={acknowledgeKvkkAction} className={w.formCardFooter}>
                <input type="hidden" name="geri" value={portalHref.consents()} />
                <Checkbox
                  id="consent-kvkk-check"
                  name="kvkk_notice"
                  required
                  label={
                    <>
                      {C.kvkkCheck}{" "}
                      <span className={layout.muted}>({LEGAL_TEXT_VERSIONS.kvkk_notice})</span>
                    </>
                  }
                />
                <Button type="submit">{C.kvkkSubmit}</Button>
              </form>
            )}
          </div>
        </Setting>

        <Setting title={C.explicitTitle} id="consent-explicit">
          {!EXPLICIT_CONSENT_KINDS.some(isExplicitConsentAsked) && (
            <p className={w.surface} data-testid="consent-none-asked">
              <span className={w.fine}>{C.noneAsked}</span>
            </p>
          )}
          {shown.length > 0 && (
            <ul className={w.rows}>
              {shown.map((kind) => {
                const record = consents.get(kind);
                const granted = record?.granted === true;
                const asked = isExplicitConsentAsked(kind);
                return (
                  <li key={kind} data-testid={`consent-${kind}`}>
                    <div className={w.rowBody}>
                      <h3 className={w.rowTitle}>{billingText.consentKind[kind]}</h3>
                      {record && (
                        <p className={w.rowMeta}>
                          {C.recorded(formatDate(record.recordedAt), record.textVersion)}
                        </p>
                      )}
                      {!asked && <p className={w.rowMeta}>{C.noLongerAsked}</p>}
                    </div>
                    <div className={w.rowEnd}>
                      <Badge tone={granted ? "success" : "neutral"} testId="consent-state">
                        {granted ? C.granted : C.notGranted}
                      </Badge>
                      <form action={setConsentAction}>
                        <input type="hidden" name="kind" value={kind} />
                        <input type="hidden" name="granted" value={granted ? "false" : "true"} />
                        <Button
                          variant="secondary"
                          size="sm"
                          className={granted ? w.dangerButton : undefined}
                          type="submit"
                        >
                          {granted ? C.withdraw : C.grant}
                        </Button>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Setting>

        {kvkkForm && (
          <Setting title={K.title} id="kvkk-request" testId="kvkk-request-link">
            <div className={w.item}>
              <p className={`${w.fine} ${w.grow}`}>{K.linkHint}</p>
              <ButtonLink variant="secondary" href="/portal/hesap/izinler/kvkk-basvurusu">
                {K.link}
              </ButtonLink>
            </div>
          </Setting>
        )}
      </SettingsShell>
    </main>
  );
}
