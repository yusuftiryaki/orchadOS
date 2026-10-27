import { canAccessSection } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/auth/session";
import { pdfFileName } from "@/lib/pdf/file-name";
import { reportPdf } from "@/lib/pdf/report-pdf";
import { getParcelReport } from "@/lib/portal/data";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// The report card of the latest published visit as a PDF, built on the server
// for this user (row level security applies; nothing is cached or stored).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ parcelId: string }> },
) {
  const user = await getSessionUser();
  if (!user) return new Response(null, { status: 401 });
  if (!canAccessSection(user.roles, "portal")) return new Response(null, { status: 403 });
  const { parcelId } = await params;
  const report = await getParcelReport(await createClient(), parcelId);
  if (!report?.latest) return new Response(null, { status: 404 });
  const body = await reportPdf(report);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdfFileName("karne", report.parcel.name, report.latest.time)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
