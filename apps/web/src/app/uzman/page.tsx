import { VisitQueue } from "@/components/expert/visit-queue";
import { requireSection } from "@/lib/auth/session";
import { listInventoryQueue } from "@/lib/expert/inventory";
import { listOrgQuestions, openCount } from "@/lib/expert/questions";
import { listQueue } from "@/lib/expert/review";
import { listParcels } from "@/lib/parcels";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const user = await requireSection("uzman");
  const supabase = await createClient();
  const [queue, inventories, parcels, questions] = await Promise.all([
    listQueue(supabase),
    listInventoryQueue(supabase),
    listParcels(supabase),
    listOrgQuestions(supabase, user.id),
  ]);
  return (
    <VisitQueue
      queue={queue}
      inventories={inventories}
      parcels={parcels}
      openQuestions={openCount(questions)}
    />
  );
}
