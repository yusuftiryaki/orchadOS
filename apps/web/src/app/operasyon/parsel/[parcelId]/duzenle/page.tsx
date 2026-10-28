import { notFound } from "next/navigation";
import { ParcelForm } from "@/components/operations/parcel-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireSection } from "@/lib/auth/session";
import { t } from "@/lib/i18n";
import { getParcelOps, opsOrgs } from "@/lib/operations/data";
import { opsHref } from "@/lib/operations/urls";
import { createClient } from "@/lib/supabase/server";

const T = t.operations;

const str = (v: string | number | null | undefined) => (v == null ? "" : String(v));

export default async function Page({ params }: { params: Promise<{ parcelId: string }> }) {
  const user = await requireSection("operasyon");
  const { parcelId } = await params;
  const supabase = await createClient();
  const [ops, orgs] = await Promise.all([
    getParcelOps(supabase, parcelId),
    opsOrgs(supabase, user.id),
  ]);
  if (!ops) notFound();
  const { parcel, detail } = ops;

  return (
    <main className="page">
      <PageHeader
        title={T.parcel.editTitle}
        back={{ href: opsHref.parcel(parcel.id), label: parcel.name }}
      />
      <ParcelForm
        orgs={orgs}
        parcelId={parcel.id}
        initial={{
          name: parcel.name,
          province: str(parcel.province),
          district: str(parcel.district),
          village: str(parcel.village),
          area_m2: str(parcel.estimated_area_m2),
          irrigation: parcel.irrigation,
          tree_count: str(parcel.estimated_tree_count),
          lat: parcel.position ? String(parcel.position[1]) : "",
          lon: parcel.position ? String(parcel.position[0]) : "",
          position_uncertainty_m: str(parcel.position_uncertainty_m),
          deed_block: str(detail?.deed_block),
          deed_parcel: str(detail?.deed_parcel),
          is_shared_deed:
            detail?.is_shared_deed == null ? "" : detail.is_shared_deed ? "yes" : "no",
          used_portion_note: str(detail?.used_portion_note),
          authorization_basis: str(detail?.authorization_basis),
          entry_permission_at: detail?.entry_permission_at?.slice(0, 10) ?? "",
          access_note: str(detail?.access_note),
          site_contact_name: str(detail?.site_contact_name),
          site_contact_phone: str(detail?.site_contact_phone),
        }}
      />
    </main>
  );
}
