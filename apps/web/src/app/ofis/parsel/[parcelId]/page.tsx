import Link from "next/link";
import { ParcelDetail } from "@/components/parcel-detail";
import { requireSection } from "@/lib/auth/session";
import { t } from "@/lib/i18n";

export default async function Page({ params }: { params: Promise<{ parcelId: string }> }) {
  await requireSection("ofis");
  const { parcelId } = await params;
  return (
    <ParcelDetail
      section="ofis"
      parcelId={parcelId}
      actions={
        <p>
          <Link className="button" href={`/ofis/parsel/${parcelId}/envanter`}>
            {t.office.openTool}
          </Link>
        </p>
      }
    />
  );
}
