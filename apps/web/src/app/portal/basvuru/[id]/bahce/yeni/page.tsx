import { notFound, redirect } from "next/navigation";
import { GardenForm } from "@/components/portal-billing/garden-form";
import s from "@/components/portal-billing/billing.module.css";
import layout from "@/components/portal/page.module.css";
import { PageHeader } from "@/components/ui/page-header";
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
    <main className={`${layout.page} ${layout.reading}`}>
      <PageHeader
        title={P.garden.newTitle}
        back={{ href: portalHref.application(id), label: P.garden.backToApplication }}
      />
      <GardenForm applicationId={id} initial={{}} />
    </main>
  );
}
