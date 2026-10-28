import { saveStaffAction } from "@/app/operasyon/legal-actions";
import { OrgPicker } from "@/components/back-office/parts";
import { LegalNotice } from "@/components/operations/legal-notice";
import styles from "@/components/operations/operations.module.css";
import { requireSection } from "@/lib/auth/session";
import { chooseOrg } from "@/lib/back-office/data";
import { firstParam } from "@/lib/back-office/urls";
import { t } from "@/lib/i18n";
import { opsOrgs } from "@/lib/operations/data";
import { listStaff } from "@/lib/operations/legal";
import { createClient } from "@/lib/supabase/server";

const T = t.legal.staff;

// Staff names and titles (T23, H05): the approving expert's name and title
// appear on the owner's report and its PDFs.
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
  const staff = org ? await listStaff(supabase, org.id) : [];

  return (
    <main className="page">
      <h1>{T.title}</h1>
      {org && <OrgPicker orgs={orgs} current={org.id} action="/operasyon/personel" />}
      <LegalNotice params={query} />
      <p className="muted">{T.hint}</p>
      {org && staff.length === 0 && <p className="muted">{T.empty}</p>}
      {org && staff.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table} data-testid="staff-table">
            <thead>
              <tr>
                <th>{T.email}</th>
                <th>{T.roles}</th>
                <th>
                  {T.name} / {T.titleField}
                </th>
              </tr>
            </thead>
            <tbody>
              {staff.map((m) => (
                <tr key={m.userId} data-staff-id={m.userId}>
                  <td>{m.email ?? "—"}</td>
                  <td>{m.roles.map((r) => T.roleNames[r] ?? r).join(", ")}</td>
                  <td>
                    <form action={saveStaffAction} className={styles.inline}>
                      <input type="hidden" name="org_id" value={org.id} />
                      <input type="hidden" name="user_id" value={m.userId} />
                      <input
                        name="full_name"
                        aria-label={T.name}
                        defaultValue={m.fullName ?? ""}
                        minLength={2}
                        maxLength={120}
                        required
                      />
                      <input
                        name="title"
                        aria-label={T.titleField}
                        placeholder={T.titlePlaceholder}
                        defaultValue={m.title ?? ""}
                        maxLength={120}
                      />
                      <button className="button button-secondary" type="submit">
                        {T.save}
                      </button>
                    </form>
                    {!m.fullName && (
                      <p className="muted" data-testid="staff-missing-name">
                        {T.missingName}
                      </p>
                    )}
                    {m.fullName && !m.title && (
                      <p className="muted" data-testid="staff-missing-title">
                        {T.missingTitle}
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
