import { pdfFileName } from "@/lib/pdf/file-name";
import { reportPdf } from "@/lib/pdf/report-pdf";
import { servePdf } from "@/lib/pdf/serve";
import { pdfDeps } from "@/lib/pdf/serve-deps";
import { getParcelReport } from "@/lib/portal/data";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// The report card of the latest published visit as a PDF, built on the server
// for this user (row level security applies; nothing is stored). A demo
// visitor gets the watermarked sample, shared between visitors (servePdf).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ parcelId: string }> },
) {
  const { parcelId } = await params;
  return servePdf(pdfDeps, {
    kind: "report",
    parcelId,
    page: `/portal/parsel/${parcelId}`,
    load: async () => {
      const report = await getParcelReport(await createClient(), parcelId);
      return report?.latest ? report : null;
    },
    sessionOf: (report) => report.latest!.id,
    render: (report, demo) => reportPdf(report, new Date(), { demo }),
    fileName: (report) => pdfFileName("karne", report.parcel.name, report.latest!.time),
  });
}
