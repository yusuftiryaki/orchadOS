import { notFound, redirect } from "next/navigation";
import { GardenForm } from "@/components/portal-billing/garden-form";
import styles from "@/components/portal/portal.module.css";
import { requireSection } from "@/lib/auth/session";
import { portalBillingText as P } from "@/lib/i18n/messages/portal-billing";
import { getApplication, getGardenDetail } from "@/lib/portal-billing/data";
import { assertCustomer } from "@/lib/portal-billing/session";
import { portalHref } from "@/lib/portal-billing/urls";
import { m2ToDonumText } from "@/lib/portal-billing/validation";
import { createClient } from "@/lib/supabase/server";

export default async function EditGardenPage({
  params,
}: {
  params: Promise<{ id: string; gardenId: string }>;
}) {
  const user = assertCustomer(await requireSection("portal"));
  const { id, gardenId } = await params;
  const supabase = await createClient();
  const view = await getApplication(supabase, user.id, id);
  const garden = view?.gardens.find((g) => g.id === gardenId);
  if (!view || !garden) notFound();
  if (view.application.status !== "draft") {
    redirect(portalHref.application(id, { hata: "application_not_draft" }));
  }
  const detail = await getGardenDetail(supabase, gardenId);
  const initial: Record<string, string> = {
    name: garden.name,
    province: garden.province ?? "",
    district: garden.district ?? "",
    village: garden.village ?? "",
    area_donum: m2ToDonumText(Number(garden.declared_area_m2)),
    irrigation: garden.irrigation,
    estimated_tree_count:
      garden.estimated_tree_count != null ? String(garden.estimated_tree_count) : "",
    lon: garden.position ? String(garden.position[0]) : "",
    lat: garden.position ? String(garden.position[1]) : "",
    boundary: garden.boundary ? JSON.stringify(garden.boundary) : "",
    authorization_basis: detail?.authorization_basis ?? "",
    deed_block: detail?.deed_block ?? "",
    deed_parcel: detail?.deed_parcel ?? "",
    is_shared_deed: detail?.is_shared_deed == null ? "" : detail.is_shared_deed ? "yes" : "no",
    used_portion_note: detail?.used_portion_note ?? "",
    access_note: detail?.access_note ?? "",
    site_contact_name: detail?.site_contact_name ?? "",
    site_contact_phone: detail?.site_contact_phone ?? "",
    // Saved gardens always have the entry permission (the function needs it).
    entry_permission: "on",
  };
  return (
    <main className={styles.page}>
      <h1>{P.garden.editTitle(garden.name)}</h1>
      <GardenForm applicationId={id} gardenId={gardenId} initial={initial} />
    </main>
  );
}
