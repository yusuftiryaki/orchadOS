import { Alert } from "@/components/ui/alert";
import { t } from "@/lib/i18n";
import { hasPistachioMethodology, speciesName } from "@/lib/species";

// Staff screens of a parcel whose species has no methodology yet (anything
// but the pilot's Antep pistachio): "genel izleme" — inventory, panorama
// tour, general health, care and weed; no pistachio-only questions.
// Renders nothing for the pilot species.
export function SpeciesNotice({ species }: { species: string | null | undefined }) {
  if (hasPistachioMethodology(species)) return null;
  return (
    <Alert
      tone="info"
      title={`${speciesName(species)}: ${t.species.genericMonitoring}`}
      testId="species-generic-monitoring"
    >
      <p>{t.species.genericMonitoringNote}</p>
    </Alert>
  );
}
