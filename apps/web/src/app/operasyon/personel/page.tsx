import { saveStaffAction } from "@/app/operasyon/legal-actions";
import { OrgPicker } from "@/components/back-office/parts";
import { LegalNotice } from "@/components/operations/legal-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, cell } from "@/components/ui/table";
import { requireSection } from "@/lib/auth/session";
import { chooseOrg } from "@/lib/back-office/data";
import { firstParam } from "@/lib/back-office/urls";
import { t } from "@/lib/i18n";
import { opsOrgs } from "@/lib/operations/data";
import { listStaff } from "@/lib/operations/legal";
import { createClient } from "@/lib/supabase/server";
import styles from "./staff.module.css";

const T = t.legal.staff;

// Staff names and titles (T23, H05): the approving expert's name and title
// appear on the owner's report and its PDFs. One form per row; the inputs
// sit in their own cells and join the row's form with the form attribute.
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
      <PageHeader title={T.title} lead={T.hint} />
      {org && <OrgPicker orgs={orgs} current={org.id} action="/operasyon/personel" />}
      <LegalNotice params={query} />
      {org && staff.length === 0 && (
        <EmptyState title={T.empty}>
          <p>{T.emptyBody}</p>
        </EmptyState>
      )}
      {org && staff.length > 0 && (
        <Table data-testid="staff-table">
          <thead>
            <tr>
              <th>{T.email}</th>
              <th>{T.roles}</th>
              <th>{T.name}</th>
              <th>{T.titleField}</th>
              <th>{T.onReport}</th>
              <th aria-label={T.save} />
            </tr>
          </thead>
          <tbody>
            {staff.map((m) => {
              const formId = `staff-${m.userId}`;
              return (
                <tr key={m.userId} data-staff-id={m.userId}>
                  <td className={cell.nowrap}>{m.email ?? "—"}</td>
                  <td>{m.roles.map((r) => T.roleNames[r] ?? r).join(", ")}</td>
                  <td>
                    <input
                      form={formId}
                      className={styles.input}
                      name="full_name"
                      aria-label={`${m.email ?? ""} ${T.name}`.trim()}
                      defaultValue={m.fullName ?? ""}
                      minLength={2}
                      maxLength={120}
                      required
                    />
                  </td>
                  <td>
                    <input
                      form={formId}
                      className={styles.input}
                      name="title"
                      aria-label={`${m.email ?? ""} ${T.titleField}`.trim()}
                      placeholder={T.titlePlaceholder}
                      defaultValue={m.title ?? ""}
                      maxLength={120}
                    />
                  </td>
                  <td>
                    {!m.fullName ? (
                      <Badge tone="warning" testId="staff-missing-name">
                        {T.missingNameShort}
                      </Badge>
                    ) : (
                      <span className={styles.preview}>
                        <span>{m.title ? `${m.fullName}, ${m.title}` : m.fullName}</span>
                        {!m.title && (
                          <Badge tone="neutral" testId="staff-missing-title">
                            {T.missingTitleShort}
                          </Badge>
                        )}
                      </span>
                    )}
                  </td>
                  <td>
                    <form id={formId} action={saveStaffAction}>
                      <input type="hidden" name="org_id" value={org.id} />
                      <input type="hidden" name="user_id" value={m.userId} />
                      <Button type="submit" variant="secondary" size="sm">
                        {T.save}
                      </Button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </main>
  );
}
