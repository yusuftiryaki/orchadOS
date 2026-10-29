import { notFound } from "next/navigation";
import { InventoryReportView } from "@/components/portal/inventory-report";
import { requireSection } from "@/lib/auth/session";
import { DEMO_PDF_LIMIT } from "@/lib/pdf/serve";
import { loadInventoryReport } from "@/lib/portal/inventory-report";
import { createClient } from "@/lib/supabase/server";

// ?hata=demo_pdf_limit after a demo session's PDF cap (servePdf).
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ parcelId: string }>;
  searchParams: Promise<{ hata?: string | string[] }>;
}) {
  const user = await requireSection("portal");
  const [{ parcelId }, query] = await Promise.all([params, searchParams]);
  const report = await loadInventoryReport(await createClient(), parcelId);
  // Not visible under RLS looks the same as not existing.
  if (!report) notFound();
  const hata = Array.isArray(query.hata) ? query.hata[0] : query.hata;
  return <InventoryReportView report={report} pdfLimit={user.demo && hata === DEMO_PDF_LIMIT} />;
}
