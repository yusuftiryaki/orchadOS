import { ParcelDetail } from "@/components/parcel-detail";
import { requireSection } from "@/lib/auth/session";

export default async function Page({ params }: { params: Promise<{ parcelId: string }> }) {
  await requireSection("uzman");
  const { parcelId } = await params;
  return <ParcelDetail section="uzman" parcelId={parcelId} />;
}
