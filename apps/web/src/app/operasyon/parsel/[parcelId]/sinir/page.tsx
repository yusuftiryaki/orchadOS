import { notFound } from "next/navigation";
import { BoundaryForm } from "@/components/operations/boundary-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireSection } from "@/lib/auth/session";
import { t } from "@/lib/i18n";
import { getParcelOps } from "@/lib/operations/data";
import { opsHref } from "@/lib/operations/urls";
import { createClient } from "@/lib/supabase/server";

const T = t.operations;

export default async function Page({ params }: { params: Promise<{ parcelId: string }> }) {
  await requireSection("operasyon");
  const { parcelId } = await params;
  const supabase = await createClient();
  const ops = await getParcelOps(supabase, parcelId);
  if (!ops) notFound();

  return (
    <main className="page">
      <PageHeader
        title={T.parcel.boundaryTitle}
        back={{ href: opsHref.parcel(parcelId), label: ops.parcel.name }}
        lead={T.parcel.boundaryLead(ops.parcel.name)}
      />
      <BoundaryForm
        parcelId={parcelId}
        nextVersion={(ops.boundary?.version ?? 0) + 1}
        previous={ops.boundary?.ring ?? null}
        position={ops.parcel.position}
      />
    </main>
  );
}
