import { AuditTable } from "@/components/back-office/audit-table";
import { OpsNav } from "@/components/operations/ops-nav";
import styles from "@/components/operations/operations.module.css";
import { requireSection } from "@/lib/auth/session";
import { chooseOrg, listAudit } from "@/lib/back-office/data";
import { boHref, firstParam } from "@/lib/back-office/urls";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { opsOrgs } from "@/lib/operations/data";
import { isUuid } from "@/lib/supabase/query";
import { createClient } from "@/lib/supabase/server";

const B = backOfficeText;
const T = B.audit;
const ENTITY_TYPES = Object.keys(T.entityTypes);

// The billing audit log (ops_audit_events), newest first, filtered by record
// type, record id and action prefix.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("operasyon");
  const query = await searchParams;
  const entityType = firstParam(query.tur) ?? "";
  const entityId = firstParam(query.kayit) ?? "";
  const action = (firstParam(query.eylem) ?? "").trim();
  const supabase = await createClient();
  const org = chooseOrg(await opsOrgs(supabase, user.id), firstParam(query.org));
  const rows = org
    ? await listAudit(supabase, org.id, {
        entityType: ENTITY_TYPES.includes(entityType) ? entityType : null,
        entityId: isUuid(entityId) ? entityId : null,
        actionPrefix: /^[a-z_.]{1,60}$/.test(action) ? action : null,
      })
    : [];

  return (
    <main className="page">
      <OpsNav current="audit" />
      <h1>{T.title}</h1>
      <form className={styles.inline} action={boHref.audit()} data-testid="audit-filter">
        <label>
          {T.entityType}
          <select name="tur" defaultValue={entityType}>
            <option value="">{B.all}</option>
            {ENTITY_TYPES.map((k) => (
              <option key={k} value={k}>
                {T.entityTypes[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {T.entityId}
          <input name="kayit" defaultValue={entityId} maxLength={36} />
        </label>
        <label>
          {T.action}
          <input name="eylem" defaultValue={action} placeholder={T.actionHint} maxLength={60} />
        </label>
        <button className="button button-secondary" type="submit">
          {B.filter}
        </button>
      </form>
      <AuditTable rows={rows} testId="audit-log" />
    </main>
  );
}
