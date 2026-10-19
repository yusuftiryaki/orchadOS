import { ParcelList } from "@/components/parcel-list";
import { requireSection } from "@/lib/auth/session";

export default async function Page() {
  await requireSection("portal");
  return <ParcelList section="portal" />;
}
