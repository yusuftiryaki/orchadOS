import { notFound } from "next/navigation";
import { fileKvkkRequestAction } from "@/app/portal/kvkk-actions";
import styles from "@/components/portal-billing/account.module.css";
import layout from "@/components/portal/page.module.css";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { requireSection } from "@/lib/auth/session";
import { formatDate, t } from "@/lib/i18n";
import { KVKK_REQUEST_TYPES, kvkkFormEnabled, myKvkkRequests } from "@/lib/portal/kvkk-request";
import { createClient } from "@/lib/supabase/server";

const T = t.legal.kvkkRequest;

const STATUS_TONE: Record<string, BadgeTone> = {
  open: "info",
  in_progress: "info",
  answered: "success",
  rejected: "danger",
};

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
    <main className={`${layout.page} ${layout.reading}`}>
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
      <form
        action={fileKvkkRequestAction}
        className={`${layout.panel} ${styles.form}`}
        data-testid="kvkk-request-form"
      >
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
        <div className={layout.actions}>
          <Button type="submit">{T.submit}</Button>
        </div>
      </form>
      <section
        className={layout.section}
        data-testid="kvkk-requests"
        aria-labelledby="kvkk-requests-title"
      >
        <h2 id="kvkk-requests-title">{T.mine}</h2>
        {requests.length === 0 ? (
          <p className={layout.muted}>{T.none}</p>
        ) : (
          <ul className={`${layout.panel} ${layout.rows} ${styles.rowsPanel}`}>
            {requests.map((r) => (
              <li key={r.id}>
                <div className={layout.rowMain}>
                  <p className={styles.name}>{T.types[r.type] ?? r.type}</p>
                  <p className={styles.meta}>{formatDate(r.createdAt)}</p>
                  {!r.settledAt && <p className={styles.meta}>{T.due(formatDate(r.dueAt))}</p>}
                </div>
                <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>
                  {T.status[r.status] ?? r.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
