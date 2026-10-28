import { inventoryPdf } from "@/lib/pdf/inventory-pdf";
import { pdfFileName } from "@/lib/pdf/file-name";
import { servePdf } from "@/lib/pdf/serve";
import { pdfDeps } from "@/lib/pdf/serve-deps";
import { loadInventoryReport } from "@/lib/portal/inventory-report";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// The owner's inventory report as a PDF, built on the server for this user
// (row level security applies; nothing is stored). A demo visitor gets the
// watermarked sample, shared between visitors (servePdf).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ parcelId: string }> },
) {
  const { parcelId } = await params;
  return servePdf(pdfDeps, {
    kind: "inventory",
    parcelId,
    page: `/portal/parsel/${parcelId}/envanter`,
    load: async () => {
      const report = await loadInventoryReport(await createClient(), parcelId);
      return report?.inventory ? report : null;
    },
    sessionOf: (report) => report.inventory!.sessionId,
    render: (report, demo) => inventoryPdf(report, new Date(), { demo }),
    fileName: (report) => pdfFileName("envanter", report.parcel.name, report.inventory!.date),
  });
}
