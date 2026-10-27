import Link from "next/link";
import { notFound } from "next/navigation";
import { savePackageAction } from "@/app/operasyon/back-office-actions";
import { ActionForm } from "@/components/back-office/action-form";
import { Submit } from "@/components/back-office/parts";
import { Field } from "@/components/operations/field";
import { OpsNav } from "@/components/operations/ops-nav";
import styles from "@/components/operations/operations.module.css";
import { requireSection } from "@/lib/auth/session";
import { chooseOrg, getPackage } from "@/lib/back-office/data";
import { boHref } from "@/lib/back-office/urls";
import { backOfficeText } from "@/lib/i18n/messages/back-office";
import { opsOrgs } from "@/lib/operations/data";
import { createClient } from "@/lib/supabase/server";

const B = backOfficeText;
const T = B.prices;

// A service package, new (/yeni) or existing (ops_save_package).
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireSection("operasyon");
  const { id } = await params;
  const supabase = await createClient();
  const pkg = id === "yeni" ? null : await getPackage(supabase, id);
  if (id !== "yeni" && !pkg) notFound();
  const orgId = pkg?.org_id ?? chooseOrg(await opsOrgs(supabase, user.id))?.id;
  if (!orgId) notFound();

  return (
    <main className="page">
      <OpsNav current="prices" />
      <p>
        <Link href={boHref.prices()}>← {T.title}</Link>
      </p>
      <h1>{pkg ? T.packageTitle(pkg.name) : T.newPackageTitle}</h1>
      <ActionForm action={savePackageAction} testId="package-form">
        <input type="hidden" name="org_id" value={orgId} />
        {pkg && <input type="hidden" name="id" value={pkg.id} />}
        <div className={styles.grid}>
          <Field label={T.code} hint={T.codeHint}>
            <input name="code" defaultValue={pkg?.code ?? ""} maxLength={32} required />
          </Field>
          <Field label={T.name}>
            <input name="name" defaultValue={pkg?.name ?? ""} maxLength={100} required />
          </Field>
          <Field label={T.visits}>
            <input
              name="periodic_visits_per_year"
              type="number"
              min={1}
              max={12}
              defaultValue={pkg?.periodic_visits_per_year ?? 4}
              required
            />
          </Field>
          <Field label={T.sort} optional>
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
        <label className={styles.check}>
          <input
            type="checkbox"
            name="includes_inventory"
            defaultChecked={pkg?.includes_inventory ?? true}
          />
          {T.inventory}
        </label>
        <label className={styles.check}>
          <input type="checkbox" name="active" defaultChecked={pkg?.active ?? true} />
          {T.active}
        </label>
        <div className={styles.actions}>
          <Submit>{B.save}</Submit>
          <Link href={boHref.prices()}>{B.cancel}</Link>
        </div>
      </ActionForm>
    </main>
  );
}
