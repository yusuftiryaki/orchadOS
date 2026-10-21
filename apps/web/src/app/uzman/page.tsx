import { VisitQueue } from "@/components/expert/visit-queue";
import { requireSection } from "@/lib/auth/session";
import { listInventoryQueue } from "@/lib/expert/inventory";
import { listQueue } from "@/lib/expert/review";
import { listParcels } from "@/lib/parcels";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  await requireSection("uzman");
  const supabase = await createClient();
  const [queue, inventories, parcels] = await Promise.all([
    listQueue(supabase),
    listInventoryQueue(supabase),
    listParcels(supabase),
  ]);
  return <VisitQueue queue={queue} inventories={inventories} parcels={parcels} />;
}
