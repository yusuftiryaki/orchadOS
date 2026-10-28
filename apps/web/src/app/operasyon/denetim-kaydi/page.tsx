import { AuditTable } from "@/components/back-office/audit-table";
import { Field } from "@/components/operations/field";
import { Pagination, pageOf, Toolbar } from "@/components/operations/ops-ui";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireSection } from "@/lib/auth/session";
import { chooseOrg, listAudit } from "@/lib/back-office/data";
import { boHref, firstParam } from "@/lib/back-office/urls";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { opsOrgs } from "@/lib/operations/data";
import { isUuid } from "@/lib/supabase/query";
import { createClient } from "@/lib/supabase/server";
import styles from "./audit.module.css";

const B = backOfficeText;
const T = B.audit;
const ENTITY_TYPES = Object.keys(T.entityTypes);
// ops_audit_events returns at most this many rows (listAudit's p_limit).
const LIMIT = 500;

// The billing audit log (ops_audit_events), newest first, filtered by record
// type, record id and action prefix; paged in memory (?sayfa=).
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
  const orgs = await opsOrgs(supabase, user.id);
  const org = chooseOrg(orgs, firstParam(query.org));
  const rows = org
    ? await listAudit(supabase, org.id, {
        entityType: ENTITY_TYPES.includes(entityType) ? entityType : null,
        entityId: isUuid(entityId) ? entityId : null,
        actionPrefix: /^[a-z_.]{1,60}$/.test(action) ? action : null,
      })
    : [];
  const filtered = !!(entityType || entityId || action);
  const filterQuery = {
    org: orgs.length > 1 ? org?.id : null,
    tur: entityType || null,
    kayit: entityId || null,
    eylem: action || null,
  };
  const base = boHref.audit(filterQuery);
  const page = pageOf(rows, query.sayfa);

  return (
    <main className="page">
      <PageHeader title={T.title} lead={T.lead} />
      <form className={styles.filters} action={boHref.audit()} data-testid="audit-filter">
        {orgs.length > 1 && org && (
          <Field label={B.org}>
            <select name="org" defaultValue={org.id}>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={T.entityType}>
          <select name="tur" defaultValue={entityType}>
            <option value="">{B.all}</option>
            {ENTITY_TYPES.map((k) => (
              <option key={k} value={k}>
                {T.entityTypes[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={T.entityId} hint={T.entityIdHint}>
          <input name="kayit" defaultValue={entityId} maxLength={36} />
        </Field>
        <Field label={T.action} hint={T.actionHint}>
          <input name="eylem" defaultValue={action} maxLength={60} />
        </Field>
        <div className={styles.filterActions}>
          <Button type="submit" variant="secondary">
            {B.filter}
          </Button>
          {filtered && (
            <ButtonLink variant="quiet" href={boHref.audit({ org: filterQuery.org })}>
              {T.clear}
            </ButtonLink>
          )}
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState title={filtered ? T.noRows : T.nothing}>
          {filtered && <p>{T.noRowsBody}</p>}
        </EmptyState>
      ) : (
        <div>
          <Toolbar end={<span className="muted">{T.count(rows.length)}</span>}>
            {rows.length >= LIMIT && <span className="muted">{T.limited(LIMIT)}</span>}
          </Toolbar>
          <AuditTable rows={page.rows} testId="audit-log" />
          <Pagination
            {...page}
            href={(p) => `${base}${base.includes("?") ? "&" : "?"}sayfa=${p}`}
          />
        </div>
      )}
    </main>
  );
}
