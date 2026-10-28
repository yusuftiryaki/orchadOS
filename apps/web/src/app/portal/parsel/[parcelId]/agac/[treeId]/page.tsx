import { notFound } from "next/navigation";
import { TreeCardView } from "@/components/portal/tree-card";
import { requireSection } from "@/lib/auth/session";
import { demoMediaOptions } from "@/lib/demo/media";
import { getTreeCard } from "@/lib/portal/data";
import { listThreads } from "@/lib/portal/questions";
import { createClient } from "@/lib/supabase/server";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ parcelId: string; treeId: string }>;
  searchParams: Promise<{ soru?: string; soru_hata?: string }>;
}) {
  const user = await requireSection("portal");
  const [{ parcelId, treeId }, query] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const card = await getTreeCard(supabase, parcelId, treeId, user.id, await demoMediaOptions(user));
  if (!card) notFound();
  const threads = await listThreads(supabase, user.id, { parcelId, treeId });
  return (
    <TreeCardView
      card={card}
      questions={{
        threads,
        sent: query.soru === "1",
        error: typeof query.soru_hata === "string" ? query.soru_hata : null,
        demo: user.demo,
      }}
    />
  );
}
