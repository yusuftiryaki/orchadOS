import Link from "next/link";
import { notFound } from "next/navigation";
import type { Section } from "@/lib/auth/roles";
import { t } from "@/lib/i18n";
import { getParcelMap } from "@/lib/parcels";
import { createClient } from "@/lib/supabase/server";
import { ParcelExplorer } from "./parcel-explorer";

export async function ParcelDetail({ section, parcelId }: { section: Section; parcelId: string }) {
  const supabase = await createClient();
  const data = await getParcelMap(supabase, parcelId);
  // Not visible under RLS looks the same as not existing.
  if (!data) notFound();

  return (
    <main className="page">
      <p>
        <Link href={`/${section}`}>← {t.parcel.back}</Link>
      </p>
      <h1>{data.parcel.name}</h1>
      <p className="muted">
        {data.boundary ? t.parcel.boundaryVersion(data.boundary.version) : t.parcel.noBoundary}
        {" · "}
        {t.parcel.slotCount(data.slots.features.length, data.activeTreeCount)}
      </p>
      <ParcelExplorer
        boundary={data.boundary?.geometry ?? null}
        slots={data.slots}
        bounds={data.bounds}
      />
    </main>
  );
}
