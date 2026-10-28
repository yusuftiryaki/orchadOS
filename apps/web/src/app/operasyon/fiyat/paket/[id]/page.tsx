import { notFound } from "next/navigation";
import { savePackageAction } from "@/app/operasyon/back-office-actions";
import { ActionForm } from "@/components/back-office/action-form";
import { Field } from "@/components/operations/field";
import styles from "@/components/operations/operations.module.css";
import { Panel } from "@/components/operations/ops-ui";
import { Button, ButtonLink } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { requireSection } from "@/lib/auth/session";
import { chooseOrg, getPackage } from "@/lib/back-office/data";
import { boHref, firstParam } from "@/lib/back-office/urls";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { opsOrgs } from "@/lib/operations/data";
import { createClient } from "@/lib/supabase/server";

const B = backOfficeText;
const T = B.prices;

// A service package, new (/yeni, in the org of ?org) or existing
// (ops_save_package).
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireSection("operasyon");
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const pkg = id === "yeni" ? null : await getPackage(supabase, id);
  if (id !== "yeni" && !pkg) notFound();
  const orgId =
    pkg?.org_id ?? chooseOrg(await opsOrgs(supabase, user.id), firstParam(query.org))?.id;
  if (!orgId) notFound();
  const back = boHref.prices(undefined, orgId);

  return (
    <main className="page">
      <PageHeader
        back={{ href: back, label: T.title }}
        title={pkg ? T.packageTitle(pkg.name) : T.newPackageTitle}
        lead={T.packageLead}
      />
      <Panel title={T.packageDetails}>
        <ActionForm action={savePackageAction} testId="package-form">
          <input type="hidden" name="org_id" value={orgId} />
          {pkg && <input type="hidden" name="id" value={pkg.id} />}
          <div className={styles.grid}>
            <Field label={T.name}>
              <input name="name" defaultValue={pkg?.name ?? ""} maxLength={100} required />
            </Field>
            <Field label={T.code} hint={T.codeHint}>
              <input name="code" defaultValue={pkg?.code ?? ""} maxLength={32} required />
            </Field>
            <Field label={T.visits} hint="1–12">
              <input
                name="periodic_visits_per_year"
                type="number"
                min={1}
                max={12}
                defaultValue={pkg?.periodic_visits_per_year ?? 4}
                required
              />
            </Field>
            <Field label={T.sort} hint={T.sortHint} optional>
              <input name="sort_order" type="number" defaultValue={pkg?.sort_order ?? 0} />
            </Field>
            <Field label={T.description} optional wide>
              <textarea
                name="description"
                defaultValue={pkg?.description ?? ""}
                maxLength={2000}
                rows={3}
              />
            </Field>
          </div>
          <Checkbox
            id="f-includes_inventory"
            name="includes_inventory"
            label={T.inventory}
            hint={T.inventoryHint}
            defaultChecked={pkg?.includes_inventory ?? true}
          />
          <Checkbox
            id="f-active"
            name="active"
            label={T.active}
            hint={T.activeHint}
            defaultChecked={pkg?.active ?? true}
          />
          <div className={styles.actions}>
            <Button type="submit">{T.savePackage}</Button>
            <ButtonLink variant="quiet" href={back}>
              {B.cancel}
            </ButtonLink>
          </div>
        </ActionForm>
      </Panel>
    </main>
  );
}
