import { canAccessSection } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/auth/session";
import { inventoryPdf } from "@/lib/pdf/inventory-pdf";
import { pdfFileName } from "@/lib/pdf/file-name";
import { loadInventoryReport } from "@/lib/portal/inventory-report";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// The owner's inventory report as a PDF, built on the server for this user
// (row level security applies; nothing is cached or stored).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ parcelId: string }> },
) {
  const user = await getSessionUser();
  if (!user) return new Response(null, { status: 401 });
  if (!canAccessSection(user.roles, "portal")) return new Response(null, { status: 403 });
  const { parcelId } = await params;
  const report = await loadInventoryReport(await createClient(), parcelId);
  if (!report?.inventory) return new Response(null, { status: 404 });
  const body = await inventoryPdf(report);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdfFileName("envanter", report.parcel.name, report.inventory.date)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
