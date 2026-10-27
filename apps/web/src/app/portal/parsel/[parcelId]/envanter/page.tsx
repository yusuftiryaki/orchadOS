import { notFound } from "next/navigation";
import { InventoryReportView } from "@/components/portal/inventory-report";
import { requireSection } from "@/lib/auth/session";
import { loadInventoryReport } from "@/lib/portal/inventory-report";
import { createClient } from "@/lib/supabase/server";

export default async function Page({ params }: { params: Promise<{ parcelId: string }> }) {
  await requireSection("portal");
  const { parcelId } = await params;
  const report = await loadInventoryReport(await createClient(), parcelId);
  // Not visible under RLS looks the same as not existing.
  if (!report) notFound();
  return <InventoryReportView report={report} />;
}
