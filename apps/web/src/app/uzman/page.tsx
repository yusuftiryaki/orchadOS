import { VisitQueue } from "@/components/expert/visit-queue";
import { requireSection } from "@/lib/auth/session";
import { listQueue } from "@/lib/expert/review";
import { listParcels } from "@/lib/parcels";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  await requireSection("uzman");
  const supabase = await createClient();
  const [queue, parcels] = await Promise.all([listQueue(supabase), listParcels(supabase)]);
  return <VisitQueue queue={queue} parcels={parcels} />;
}
