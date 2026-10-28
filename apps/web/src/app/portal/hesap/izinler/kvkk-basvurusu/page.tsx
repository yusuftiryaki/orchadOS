import Link from "next/link";
import { notFound } from "next/navigation";
import { fileKvkkRequestAction } from "@/app/portal/kvkk-actions";
import styles from "@/components/portal/portal.module.css";
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
  const query = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const notice = one(query.bilgi) === "gonderildi";
  const error = one(query.hata);
  const requests = await myKvkkRequests(supabase);

  return (
    <main className={styles.page}>
      <p>
        <Link href="/portal/hesap/izinler">← {T.back}</Link>
      </p>
      <h1>{T.title}</h1>
      <p>{T.lead}</p>
      {notice && (
        <p className={styles.notice} role="status">
          {T.sent}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {T.errors[error] ?? T.errors.failed}
        </p>
      )}
      <form action={fileKvkkRequestAction} className={styles.section} data-testid="kvkk-request-form">
        <label>
          {T.type}
          <br />
          <select name="type" defaultValue="access" required>
            {KVKK_REQUEST_TYPES.map((type) => (
              <option key={type} value={type}>
                {T.types[type]}
              </option>
            ))}
          </select>
        </label>
        <p>
          <label>
            {T.message}
            <br />
            <textarea name="message" required maxLength={2000} rows={6} cols={60} />
          </label>
        </p>
        <p className="muted">{T.hint}</p>
        <button className="button" type="submit">
          {T.submit}
        </button>
      </form>
      <section className={styles.section} data-testid="kvkk-requests">
        <h2>{T.mine}</h2>
        {requests.length === 0 ? (
          <p className="muted">{T.none}</p>
        ) : (
          <ul>
            {requests.map((r) => (
              <li key={r.id}>
                {T.types[r.type] ?? r.type} · {formatDate(r.createdAt)} · {T.status[r.status] ?? r.status}
                {!r.settledAt && <span className="muted"> · {T.due(formatDate(r.dueAt))}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
