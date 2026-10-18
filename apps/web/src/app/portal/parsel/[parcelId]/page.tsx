import { ParcelDetail } from "@/components/parcel-detail";
import { requireSection } from "@/lib/auth/session";

export default async function Page({ params }: { params: Promise<{ parcelId: string }> }) {
  await requireSection("portal");
  const { parcelId } = await params;
  return <ParcelDetail section="portal" parcelId={parcelId} />;
}
