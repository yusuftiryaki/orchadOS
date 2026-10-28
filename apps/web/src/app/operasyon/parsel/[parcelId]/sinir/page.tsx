import Link from "next/link";
import { notFound } from "next/navigation";
import { BoundaryForm } from "@/components/operations/boundary-form";
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
      <p>
        <Link href={opsHref.parcel(parcelId)}>← {ops.parcel.name}</Link>
      </p>
      <h1>{T.parcel.boundaryTitle}</h1>
      <BoundaryForm
        parcelId={parcelId}
        nextVersion={(ops.boundary?.version ?? 0) + 1}
        previous={ops.boundary?.ring ?? null}
        position={ops.parcel.position}
      />
    </main>
  );
}
