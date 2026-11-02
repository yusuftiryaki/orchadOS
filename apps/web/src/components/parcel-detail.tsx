import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import type { Section } from "@/lib/auth/roles";
import { t } from "@/lib/i18n";
import { getParcelMap } from "@/lib/parcels";
import { hasPistachioMethodology, speciesName } from "@/lib/species";
import { createClient } from "@/lib/supabase/server";
import { ParcelExplorer } from "./parcel-explorer";
import { statusTone } from "@/components/ui/status";
import staff from "@/components/staff-page.module.css";

export async function ParcelDetail({
  section,
  parcelId,
  actions,
  headerActions,
}: {
  section: Section;
  parcelId: string;
  // Section-specific content shown under the header (e.g. operations panels).
  actions?: React.ReactNode;
  // The screen's main buttons, beside the title (e.g. the office tool).
  headerActions?: React.ReactNode;
}) {
  const supabase = await createClient();
  const data = await getParcelMap(supabase, parcelId);
  // Not visible under RLS looks the same as not existing.
  if (!data) notFound();
  const slots = data.slots.features.length;

  return (
    <main className={`page ${staff.page}`}>
      <PageHeader
        back={{ href: `/${section}`, label: t.sections[section] }}
        title={data.parcel.name}
        meta={
          <>
            <Badge tone={statusTone(data.parcel.status, "parcel")}>
              {t.parcels.status[data.parcel.status]}
            </Badge>
            <Badge tone={data.boundary ? "neutral" : "warning"}>
              {data.boundary
                ? t.parcel.boundaryVersion(data.boundary.version)
                : t.parcel.noBoundary}
            </Badge>
            {/* Species; other than the pilot's: generic monitoring (lib/species.ts). */}
            <Badge
              tone={hasPistachioMethodology(data.parcel.species) ? "neutral" : "warning"}
              testId="parcel-species-badge"
            >
              {hasPistachioMethodology(data.parcel.species)
                ? speciesName(data.parcel.species)
                : `${speciesName(data.parcel.species)}: ${t.species.genericMonitoring}`}
            </Badge>
            <span className="muted" data-testid="parcel-slot-count">
              {slots > 0 ? t.parcel.slotCount(slots, data.activeTreeCount) : t.parcel.noSlots}
            </span>
          </>
        }
        actions={headerActions}
      />
      {actions}
      <ParcelExplorer
        boundary={data.boundary?.geometry ?? null}
        slots={data.slots}
        bounds={data.bounds}
      />
    </main>
  );
}
