import { ParcelList } from "@/components/parcel-list";
import { requireSection } from "@/lib/auth/session";

export default async function Page() {
  await requireSection("operasyon");
  return <ParcelList section="operasyon" />;
}
