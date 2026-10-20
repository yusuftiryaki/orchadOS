import { GardenList } from "@/components/portal/garden-list";
import { requireSection } from "@/lib/auth/session";
import { listPortalParcels } from "@/lib/portal/data";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  await requireSection("portal");
  const supabase = await createClient();
  return <GardenList parcels={await listPortalParcels(supabase)} />;
}
