import { ParcelDetail } from "@/components/parcel-detail";
import { ButtonLink } from "@/components/ui/button";
import { requireSection } from "@/lib/auth/session";
import { t } from "@/lib/i18n";

export default async function Page({ params }: { params: Promise<{ parcelId: string }> }) {
  await requireSection("ofis");
  const { parcelId } = await params;
  return (
    <ParcelDetail
      section="ofis"
      parcelId={parcelId}
      headerActions={
        <>
          <ButtonLink variant="secondary" href={`/ofis/parsel/${parcelId}/envanter/duzenle`}>
            {t.inventory.office.open}
          </ButtonLink>
          <ButtonLink href={`/ofis/parsel/${parcelId}/envanter`}>{t.office.openTool}</ButtonLink>
        </>
      }
    />
  );
}
