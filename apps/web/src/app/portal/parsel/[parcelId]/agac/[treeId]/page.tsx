import { notFound } from "next/navigation";
import { TreeCardView } from "@/components/portal/tree-card";
import { requireSection } from "@/lib/auth/session";
import { getTreeCard } from "@/lib/portal/data";
import { createClient } from "@/lib/supabase/server";

export default async function Page({
  params,
}: {
  params: Promise<{ parcelId: string; treeId: string }>;
}) {
  const user = await requireSection("portal");
  const { parcelId, treeId } = await params;
  const supabase = await createClient();
  const card = await getTreeCard(supabase, parcelId, treeId, user.id);
  if (!card) notFound();
  return <TreeCardView card={card} />;
}
