import { notFound } from "next/navigation";
import { fileKvkkRequestAction } from "@/app/portal/kvkk-actions";
import { SettingsShell } from "@/components/portal-billing/settings-shell";
import w from "@/components/portal-billing/workspace.module.css";
import layout from "@/components/portal/page.module.css";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { statusTone } from "@/components/ui/status";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Select, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { requireSection } from "@/lib/auth/session";
import { formatDate, t } from "@/lib/i18n";
import { KVKK_REQUEST_TYPES, kvkkFormEnabled, myKvkkRequests } from "@/lib/portal/kvkk-request";
import { createClient } from "@/lib/supabase/server";

const T = t.legal.kvkkRequest;

// T11 (H26): the portal KVKK application form, Hesabım › İzinler › KVKK
// başvurusu. The portal session is the applicant's verified identity
// (docs/hukuk/kvkk-basvuru-proseduru.md); the answer comes within 30 days.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("portal");
  const supabase = await createClient();
  if (user.demo || !(await kvkkFormEnabled(supabase))) notFound();
  const [query, requests] = await Promise.all([searchParams, myKvkkRequests(supabase)]);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const notice = one(query.bilgi) === "gonderildi";
  const error = one(query.hata);
  const errorText = error ? (T.errors[error] ?? T.errors.failed) : null;
  // A missing type or message is said at its field; anything else on top.
  const fieldError = error === "invalid_type" || error === "invalid_message";

  return (
    <main className={layout.page}>
      <SettingsShell current="consents">
        <PageHeader
          title={T.title}
          lead={T.lead}
          back={{ href: "/portal/hesap/izinler", label: T.back }}
        />
        {notice && (
          <Alert tone="success" role="status">
            <p>{T.sent}</p>
          </Alert>
        )}
        {errorText && !fieldError && (
          <Alert tone="danger" role="alert">
            <p>{errorText}</p>
          </Alert>
        )}
        <form action={fileKvkkRequestAction} className={w.formCard} data-testid="kvkk-request-form">
          <div className={w.formCardBody}>
            <Field
              id="kvkk-type"
              label={T.type}
              error={error === "invalid_type" ? errorText : undefined}
            >
              <Select name="type" defaultValue="access" required>
                {KVKK_REQUEST_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {T.types[type]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              id="kvkk-message"
              label={T.message}
              hint={T.hint}
              error={error === "invalid_message" ? errorText : undefined}
            >
              <Textarea name="message" required maxLength={2000} rows={6} />
            </Field>
          </div>
          <div className={w.formCardFooter}>
            <Button type="submit">{T.submit}</Button>
          </div>
        </form>
        <section
          className={w.section}
          id="kvkk-requests"
          data-testid="kvkk-requests"
          aria-labelledby="kvkk-requests-title"
        >
          <h2 id="kvkk-requests-title" className={w.sectionTitle}>
            {T.mine}
          </h2>
          {requests.length === 0 ? (
            <EmptyState title={T.none} headingLevel={3} compact>
              <p>{T.noneBody}</p>
            </EmptyState>
          ) : (
            <ul className={w.rows}>
              {requests.map((r) => (
                <li key={r.id}>
                  <div className={w.rowBody}>
                    <p className={w.rowTitle}>{T.types[r.type] ?? r.type}</p>
                    <p className={w.rowMeta}>{formatDate(r.createdAt)}</p>
                    {!r.settledAt && <p className={w.rowMeta}>{T.due(formatDate(r.dueAt))}</p>}
                  </div>
                  <Badge tone={statusTone(r.status, "kvkk")}>
                    {T.status[r.status] ?? r.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </SettingsShell>
    </main>
  );
}
