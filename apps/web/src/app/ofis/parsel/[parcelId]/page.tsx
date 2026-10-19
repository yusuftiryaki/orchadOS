import { ParcelDetail } from "@/components/parcel-detail";
import { requireSection } from "@/lib/auth/session";

export default async function Page({ params }: { params: Promise<{ parcelId: string }> }) {
  await requireSection("ofis");
  const { parcelId } = await params;
  return <ParcelDetail section="ofis" parcelId={parcelId} />;
}
