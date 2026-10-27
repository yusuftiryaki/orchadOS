import { notFound, redirect } from "next/navigation";
import { GardenForm } from "@/components/portal-billing/garden-form";
import styles from "@/components/portal/portal.module.css";
import { requireSection } from "@/lib/auth/session";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { getApplication } from "@/lib/portal-billing/data";
import { assertCustomer } from "@/lib/portal-billing/session";
import { portalHref } from "@/lib/portal-billing/urls";
import { createClient } from "@/lib/supabase/server";

export default async function NewGardenPage({ params }: { params: Promise<{ id: string }> }) {
  const user = assertCustomer(await requireSection("portal"));
  const { id } = await params;
  const view = await getApplication(await createClient(), user.id, id);
  if (!view) notFound();
  if (view.application.status !== "draft") {
    redirect(portalHref.application(id, { hata: "application_not_draft" }));
  }
  return (
    <main className={styles.page}>
      <h1>{P.garden.newTitle}</h1>
      <GardenForm applicationId={id} initial={{}} />
    </main>
  );
}
